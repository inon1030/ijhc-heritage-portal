import { creditText } from '@/lib/files/credit-text';
import { composeCredit, creditCachePath } from '@/lib/files/credit-band';
import { recordProblem } from '@/lib/problems/record';
import { problemCode } from '@/lib/problems/code';
import { NextRequest, NextResponse } from 'next/server';
import { getMessages } from '@/lib/i18n';
import { fail, unexpected } from '@/lib/api';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { makeThumb } from '@/lib/files/rendition';
import { getCurrentAdmin, getCurrentVolunteer } from '@/lib/supabase/server';

const SIGNED_URL_TTL_SECONDS = 600;

/**
 * The only way to reach a stored file.
 *
 * The bucket is private, so guessing a storage path gets you nothing. This
 * handler decides: a published item's file is served to anyone, and everything
 * else — pending, rejected, shadow gallery — needs a volunteer session.
 *
 * In the demo the bucket was public and every file ever uploaded, including
 * those attached to rejected submissions, stayed reachable forever.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ fileId: string }> }) {
  const { t } = await getMessages();

  try {
    const { fileId } = await context.params;
    const admin = createAdminSupabase();

    const { data: file, error } = await admin
      .from('item_files')
      .select('storage_path, preview_path, mime_type, checksum, items(status, access, deleted_at, collector_name, source)')
      .eq('id', fileId)
      .maybeSingle();

    if (error) throw error;
    if (!file) return fail(404, 'not_found', t('err.fileNotFound'));

    const item = file.items as unknown as {
      collector_name: string | null;
      source: string | null;
      status: string;
      access: string;
      deleted_at: string | null;
    } | null;

    /*
     * `deleted_at` matters here and nowhere else in this file.
     *
     * A binned record keeps `accepted` and `public` — that is what lets an
     * administrator restore it without re-running the review — so on status and
     * access alone a record in the bin still reads as published. This route runs
     * on the service-role client, out of RLS's reach, and it is the only way to
     * a stored file. Without this term, sending a record to the bin would take
     * it off every page while leaving the scan itself on a URL that anything
     * which had already crawled the site still holds.
     */
    const isPublished =
      item?.status === 'accepted' && item?.access === 'public' && item?.deleted_at === null;

    /*
     * An approved volunteer, not merely someone with a profile row.
     *
     * `getCurrentProfile()` returns a row for a self-registered `pending`
     * account, and anyone can self-register. It also kept returning one for a
     * volunteer whose role had been revoked — so revocation did not revoke:
     * they held every file id they had ever seen. Every other gate in the
     * system reads the role. This one now does too.
     */
    const expert = await getCurrentVolunteer();
    if (!isPublished && !expert) {
      return fail(403, 'forbidden', t('err.fileNotPublic'));
    }

    // A record in the bin is an administrator's to look at, the same as the row
    // is. Volunteers reach every other unpublished file; this is the one they
    // do not, so that "binned" means the same thing here as it does in the
    // database.
    if (item?.deleted_at && !(await getCurrentAdmin())) {
      return fail(403, 'forbidden', 'This file is not publicly available.');
    }

    // Experts always receive the master, even when a UI requests a derivative.
    const wantsRendition = request.nextUrl.searchParams.has('rendition');
    const path = !expert && wantsRendition && file.preview_path ? file.preview_path : file.storage_path;

    // Authorize before reading private cached bytes; never cache access decisions.
    if (!expert && isPublished && (file.mime_type ?? '').startsWith('image/')) {
      const bucket = admin.storage.from('heritage');
      const thumbnail = request.nextUrl.searchParams.has('thumb');
      const text = creditText(item?.collector_name, item?.source, undefined, 48);
      const cachePath = creditCachePath(fileId, file.checksum, path, thumbnail ? 'thumb' : 'full', text);
      const imageResponse = (bytes: Uint8Array, mime = 'image/jpeg') => new NextResponse(bytes as unknown as BodyInit, {
        headers: { 'Content-Type': mime, 'Content-Disposition': 'inline',
          'Content-Length': String(bytes.byteLength), 'Cache-Control': 'private, no-store',
            Vary: 'Cookie, Authorization', 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "sandbox; default-src 'none'" },
      });
      const { data: cached } = await bucket.download(cachePath).catch(() => ({ data: null }));
      if (cached) return imageResponse(new Uint8Array(await cached.arrayBuffer()));
      const { data: blob, error: downloadError } = await bucket.download(path);
      if (downloadError || !blob) return fail(502, 'storage_unavailable', t('err.fileNotOpened'));
      const original = new Uint8Array(await blob.arrayBuffer());
      let bytes: Uint8Array = original;
      let mime = wantsRendition && file.preview_path ? 'image/jpeg' : file.mime_type;
      try {
        if (thumbnail) {
          const thumb = await makeThumb(original);
          if (thumb) { bytes = new Uint8Array(thumb); mime = 'image/jpeg'; }
        }
        const burned = await composeCredit(bytes, text);
        // Cache failures must not discard a successfully rendered image.
        const { error: cacheError } = await bucket.upload(cachePath, burned, { contentType: 'image/jpeg', upsert: true }).catch(() => ({ error: true }));
        if (cacheError) await recordProblem({ code: problemCode(), source: 'server', place: 'files/credit-cache', message: 'Could not cache credit derivative' });
        return imageResponse(new Uint8Array(burned));
      } catch {
        await recordProblem({ code: problemCode(), source: 'server', place: 'files/credit-band', message: 'Could not render credit derivative' });
        return imageResponse(bytes, mime);
      }
    }

    const { data: signed, error: signError } = await admin
      .storage.from('heritage')
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed) return fail(502, 'storage_unavailable', t('err.fileNotOpened'));

    if (isPublished && !expert) {
      // Stream through our response so the inline disposition governs the
      // actual bytes, not just a redirect. Range is essential for seeking.
      const range = request.headers.get('range');
      const upstream = await fetch(signed.signedUrl, {
        headers: range ? { Range: range } : undefined,
        cache: 'no-store', signal: request.signal,
      });
      if (![200, 206, 416].includes(upstream.status)) {
        await upstream.body?.cancel();
        return fail(502, 'storage_unavailable', t('err.fileNotOpened'));
      }
      const headers = new Headers({
        'Content-Type': upstream.headers.get('content-type') ?? file.mime_type,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
        Vary: 'Cookie, Authorization',
        'X-Content-Type-Options': 'nosniff',
        // Files must not execute in the application's origin.
        'Content-Security-Policy': "sandbox; default-src 'none'",
      });
      for (const key of ['content-length', 'content-range', 'accept-ranges']) {
        const value = upstream.headers.get(key);
        if (value) headers.set(key, value);
      }
      return new NextResponse(upstream.body, { status: upstream.status, headers });
    }

    return NextResponse.redirect(signed.signedUrl, {
      status: 307,
      headers: {
        // A privileged redirect must never be replayed from a shared cache.
        'Cache-Control': 'private, no-store',
        Vary: 'Cookie, Authorization',
      },
    });
  } catch (error) {
    return unexpected(error, '/api/files/[fileId]');
  }
}