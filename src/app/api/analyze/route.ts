import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAIProvider } from '@/lib/ai';
import { fail, invalid, ok, unexpected } from '@/lib/api';
import { resolveMimeType } from '@/lib/files/detect';
import { readImageDimensions } from '@/lib/files/dimensions';
import { validateFile } from '@/lib/files/validate';
import { verifyGrant } from '@/lib/files/grant';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { makeRendition, needsRendition, renditionPath } from '@/lib/files/rendition';
import { mediaFacetFrom } from '@/lib/fields/suggestions';
import { createAdminSupabase } from '@/lib/supabase/admin';

const Body = z.object({
  path: z.string().min(1).max(400),
  /** Proof from /api/uploads/sign or /api/links/ingest that this path is the caller's. */
  grant: z.string().min(1).max(200),
  expiresAt: z.number(),
  /**
   * Optional now. The contribution screen asks for a title but does not insist
   * on one, and an untitled file is still worth reading — the model is told
   * plainly that there is no title rather than being handed an empty string as
   * though it were one.
   */
  title: z.string().max(200).optional(),
});

export const maxDuration = 60;

/**
 * Runs the AI pass over an already-uploaded file and returns suggestions for
 * the contributor to look at. Nothing is persisted here — the record is only
 * created when the contributor submits.
 *
 * Technical metadata in the response is measured from the bytes, never
 * produced by the model.
 */
export async function POST(request: NextRequest) {
  try {
    /*
     * Two gates, and they close different doors.
     *
     * The limit caps what one caller can spend: every call here is a billed
     * model request plus, for a TIFF, a full decode. Without it an attacker
     * with one valid path could loop indefinitely on someone else's bill.
     *
     * The grant answers whose path it is. This handler reads storage with the
     * service-role client, so before it existed any object in the bucket —
     * including files on unpublished and rejected records — could be read back
     * with its OCR text by anyone who knew a path.
     */
    const limit = rateLimit(`analyse:${clientKey(request)}`, { limit: 20, windowMs: 60_000 });
    if (!limit.allowed) {
      return fail(429, 'rate_limited', `Too many readings. Try again in ${limit.retryAfterSeconds} seconds.`);
    }

    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) return invalid(parsed.error);

    if (!verifyGrant(parsed.data.path, parsed.data.expiresAt, parsed.data.grant)) {
      return fail(403, 'forbidden', 'That upload was not created here, or it has expired.');
    }

    const admin = createAdminSupabase();
    const { data: blob, error } = await admin.storage.from('heritage').download(parsed.data.path);
    if (error || !blob) return fail(404, 'file_not_found', 'That upload could not be found. Try uploading again.');

    const bytes = new Uint8Array(await blob.arrayBuffer());

    // The type the browser claimed is a claim; the first bytes are the fact.
    // This is the only point in the pipeline where the file's own content is
    // available, so it is where the type is settled — for validation, for the
    // dimension reader, and for what the contributor submits.
    const mimeType = resolveMimeType(bytes, blob.type || 'application/octet-stream');

    const rejection = validateFile({ mimeType, byteSize: bytes.byteLength });
    if (rejection) return fail(415, rejection.code, rejection.message);

    const dimensions = readImageDimensions(bytes, mimeType);

    /*
     * A viewable copy, for the formats no browser renders.
     *
     * Made here because this is the one place in the pipeline that holds the
     * bytes, and made before the analysis so that a slow model does not delay
     * the contributor seeing their own scan. The master is untouched.
     *
     * `previewUrl` is signed and short-lived: the record does not exist yet, so
     * there is no file id to broker access through, and the contributor is the
     * only person who should see it before it is submitted.
     */
    let previewPath: string | null = null;
    let previewUrl: string | null = null;
    /** The master's size, when only the decoder could read it. */
    let decodedSize: { width: number; height: number } | null = null;

    if (needsRendition(mimeType)) {
      const rendition = await makeRendition(bytes);
      if (rendition) {
        if (rendition.sourceWidth && rendition.sourceHeight) {
          decodedSize = { width: rendition.sourceWidth, height: rendition.sourceHeight };
        }
        const target = renditionPath(parsed.data.path);
        const { error: renditionError } = await admin.storage
          .from('heritage')
          .upload(target, rendition.bytes, { contentType: rendition.mimeType, upsert: true });

        if (renditionError) {
          console.error('[analyze] rendition upload failed', renditionError);
        } else {
          previewPath = target;
          const { data: signed } = await admin.storage.from('heritage').createSignedUrl(target, 900);
          previewUrl = signed?.signedUrl ?? null;
        }
      }
    }

    /*
     * An address for the file itself, when no derivative was needed.
     *
     * The record does not exist yet, so there is no file id to broker access
     * through, and a captured web page has no local object URL the way a picked
     * file does. Without this the pre-review shows the reading of a lead image
     * and not the image. Short-lived and signed: the contributor is the only
     * person who should see it before it is submitted.
     */
    if (!previewUrl && mimeType.startsWith('image/')) {
      const { data: signed } = await admin.storage
        .from('heritage')
        .createSignedUrl(parsed.data.path, 900);
      previewUrl = signed?.signedUrl ?? null;
    }

    const provider = getAIProvider();

    try {
      const analysis = await provider.analyze({
        bytes,
        mimeType,
        fileName: parsed.data.path.split('/').pop() ?? 'file',
        title: parsed.data.title ?? '',
      });

      /*
       * The media branch comes from the resolved MIME type, not from the model.
       *
       * It sits here rather than inside the provider because this is where the
       * file's own facts are established — the type was settled from the first
       * bytes a few lines above, beside the dimensions. Nothing measured is
       * ever asked of a model, and a value derived here cannot be wrong in the
       * way a 0.98 inference can.
       */
      const derived = mediaFacetFrom(mimeType);

      return ok({
        analysis: derived ? { ...analysis, fields: [...analysis.fields, derived] } : analysis,
        simulated: provider.isSimulated,
        previewPath,
        previewUrl,
        metadata: { mimeType, byteSize: bytes.byteLength, ...(dimensions ?? decodedSize ?? {}) },
      });
    } catch (analysisError) {
      console.error('[analyze] provider failed', analysisError);
      return ok({
        analysis: null,
        simulated: provider.isSimulated,
        // The rendition was made before the model was asked, so a failed
        // analysis still leaves the contributor looking at their own scan.
        previewPath,
        previewUrl,
        error: 'The analysis service did not respond. You can still submit and describe the item yourself.',
        metadata: { mimeType, byteSize: bytes.byteLength, ...(dimensions ?? decodedSize ?? {}) },
      });
    }
  } catch (error) {
    return unexpected(error);
  }
}
