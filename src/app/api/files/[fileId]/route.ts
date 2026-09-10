import { NextRequest, NextResponse } from 'next/server';
import { getMessages } from '@/lib/i18n';
import { fail, unexpected } from '@/lib/api';
import { createAdminSupabase } from '@/lib/supabase/admin';
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
      .select('storage_path, preview_path, items(status, access, deleted_at)')
      .eq('id', fileId)
      .maybeSingle();

    if (error) throw error;
    if (!file) return fail(404, 'not_found', t('err.fileNotFound'));

    const item = file.items as unknown as {
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
    if (!isPublished && !(await getCurrentVolunteer())) {
      return fail(403, 'forbidden', t('err.fileNotPublic'));
    }

    // A record in the bin is an administrator's to look at, the same as the row
    // is. Volunteers reach every other unpublished file; this is the one they
    // do not, so that "binned" means the same thing here as it does in the
    // database.
    if (item?.deleted_at && !(await getCurrentAdmin())) {
      return fail(403, 'forbidden', 'This file is not publicly available.');
    }

    /*
     * `?rendition` asks for the viewable copy rather than the master.
     *
     * The same permission decision governs both — one row, one check — so a
     * derivative can never be reachable when its master is not. If a caller
     * asks for a rendition and none was made, the master is served: it is
     * viewable, which is precisely why no derivative exists.
     */
    const wantsRendition = request.nextUrl.searchParams.has('rendition');
    const path = wantsRendition && file.preview_path ? file.preview_path : file.storage_path;

    const { data: signed, error: signError } = await admin
      .storage.from('heritage')
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed) return fail(502, 'storage_unavailable', t('err.fileNotOpened'));

    return NextResponse.redirect(signed.signedUrl, {
      status: 307,
      headers: {
        // Published files may sit in a shared cache; anything else must not.
        'Cache-Control': isPublished
          ? `public, max-age=${SIGNED_URL_TTL_SECONDS - 60}`
          : 'private, no-store',
      },
    });
  } catch (error) {
    return unexpected(error);
  }
}
