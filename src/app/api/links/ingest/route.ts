import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, invalid, ok, readJson, unexpected } from '@/lib/api';
import { issueGrant } from '@/lib/files/grant';
import { buildStoragePath } from '@/lib/files/paths';
import { resolveMimeType } from '@/lib/files/detect';
import { validateFile } from '@/lib/files/validate';
import { captureLink, fetchImage } from '@/lib/links/fetch';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { createAdminSupabase } from '@/lib/supabase/admin';

const Body = z.object({ url: z.string().min(4).max(2000) });

export const maxDuration = 60;

/**
 * Turns an address into something the archive can hold.
 *
 * An article about the Sassoon family is heritage material, and until now the
 * only way to contribute one was to screenshot it. A screenshot loses the text,
 * the date, and the address it came from.
 *
 * **The page is captured, not linked.** A link is a promise that someone else
 * will keep a page online, and they will not — link rot is the ordinary fate of
 * a newspaper's archive. So what is stored is a snapshot: the readable text as
 * a text file, and the page's lead image beside it. Both go through the same
 * pipeline as an uploaded file, are read by the same model, and are reviewed by
 * the same volunteer. `items.source_url` records where it came from.
 *
 * A YouTube link is captured the same way with one difference stated plainly on
 * the record: **the archive does not watch the video.** What is kept is the
 * title, the channel and the thumbnail, which is what YouTube publishes about
 * it. Describing footage nobody examined is the exact failure this system was
 * built to prevent.
 *
 * The dangerous part is not here — it is in `src/lib/links/fetch.ts`, which
 * decides whether an address may be fetched at all.
 */
export async function POST(request: NextRequest) {
  try {
    // A fetch the server makes is more expensive than one it serves, and this
    // one reaches the outside world. Same bucket as uploads.
    const limit = rateLimit(clientKey(request));
    if (!limit.allowed) {
      return fail(429, 'rate_limited', `Too many links. Try again in ${limit.retryAfterSeconds} seconds.`);
    }

    const parsed = Body.safeParse(await readJson(request));
    if (!parsed.success) return invalid(parsed.error);

    const captured = await captureLink(parsed.data.url);
    if ('code' in captured) {
      const status = captured.code === 'blocked_host' ? 403 : captured.code === 'too_large' ? 413 : 422;
      return fail(status, captured.code, captured.message);
    }

    const admin = createAdminSupabase();
    // The captured files are stored here rather than by the browser, so this
    // route mints their grants — the same proof /api/uploads/sign hands back.
    const files: {
      path: string;
      grant: string;
      expiresAt: number;
      fileName: string;
      mimeType: string;
      byteSize: number;
      width: number | null;
      height: number | null;
    }[] = [];

    /*
     * The image first, so it becomes the record's cover.
     *
     * A record leads with the thing a person recognises, and for an article
     * that is the photograph rather than a wall of text. Failing to fetch it is
     * not an error: the capture still holds the words, which is the part that
     * matters.
     */
    if (captured.imageUrl) {
      const image = await fetchImage(captured.imageUrl);
      if (image) {
        const mimeType = resolveMimeType(image.bytes, image.mimeType);
        if (!validateFile({ mimeType, byteSize: image.bytes.byteLength })) {
          const path = buildStoragePath(`lead-image.${mimeType.split('/')[1] ?? 'jpg'}`);
          const { error } = await admin.storage
            .from('heritage')
            .upload(path, image.bytes, { contentType: mimeType, upsert: false });

          if (error) console.error('[links] lead image upload failed', error);
          else
            files.push({
              path,
              ...issueGrant(path),
              fileName: `${hostOf(captured.url)} — lead image`,
              mimeType,
              byteSize: image.bytes.byteLength,
              width: null,
              height: null,
            });
        }
      }
    }

    // The capture itself. Header lines first so that the model, and any person
    // who opens the file in ten years, can see what this is and where it came
    // from without needing this codebase to explain it.
    const snapshot = [
      `Captured from: ${captured.url}`,
      `Captured on: ${new Date().toISOString().slice(0, 10)}`,
      captured.siteName ? `Site: ${captured.siteName}` : null,
      captured.title ? `Title: ${captured.title}` : null,
      captured.video ? `Video on ${captured.video.provider}, not watched by the archive.` : null,
      '',
      captured.description ?? '',
      captured.description ? '' : null,
      captured.text,
    ]
      .filter((line) => line !== null)
      .join('\n');

    const snapshotBytes = new TextEncoder().encode(snapshot);
    const snapshotPath = buildStoragePath(`${hostOf(captured.url)}-capture.txt`);

    const { error: snapshotError } = await admin.storage
      .from('heritage')
      // Bare `text/plain`, no charset parameter: the bucket's allow-list is an
      // exact string match, so "text/plain; charset=utf-8" is a different type
      // as far as it is concerned and is refused.
      .upload(snapshotPath, snapshotBytes, { contentType: 'text/plain', upsert: false });

    if (snapshotError) {
      console.error('[links] snapshot upload failed', snapshotError.message, snapshotError);
      return fail(502, 'storage_unavailable', 'The page was read but could not be stored. Try again.');
    }

    files.push({
      path: snapshotPath,
      ...issueGrant(snapshotPath),
      fileName: `${hostOf(captured.url)} — captured text`,
      mimeType: 'text/plain',
      byteSize: snapshotBytes.byteLength,
      width: null,
      height: null,
    });

    return ok({
      sourceUrl: captured.url,
      title: captured.title ?? hostOf(captured.url),
      siteName: captured.siteName,
      video: captured.video,
      files,
    });
  } catch (error) {
    return unexpected(error);
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'page';
  }
}
