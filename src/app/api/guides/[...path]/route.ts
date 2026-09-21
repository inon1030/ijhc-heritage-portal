import { NextRequest, NextResponse } from 'next/server';
import { fail, unexpected } from '@/lib/api';
import { canOpen, resolveGuidePath } from '@/lib/guides/catalogue';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getCurrentProfile } from '@/lib/supabase/server';

/** Long enough to watch a ten-minute video with pauses, short enough to be useless if shared. */
const SIGNED_URL_TTL_SECONDS = 3 * 60 * 60;

/**
 * The only way to a guide file.
 *
 * The `guides` bucket is private. This decides, per file, whether the reader
 * may open it - contributor material for anyone, the knowledge-expert guide for
 * an approved account, the administrator guide for an administrator - and only
 * then signs a short-lived URL and redirects to it. Same shape as
 * `/api/files/[fileId]`: the page hides what you cannot open, and this makes
 * hiding it unnecessary for safety.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: parts } = await context.params;
    const path = parts.join('/');
    const guide = resolveGuidePath(path);
    if (!guide) return fail(404, 'not_found', 'There is no such guide.');

    if (guide.audience !== 'contributor') {
      const profile = await getCurrentProfile().catch(() => null);
      if (!canOpen(guide.audience, profile?.role)) {
        return fail(403, 'forbidden', 'This guide is for knowledge experts and administrators of the archive.');
      }
    }

    const { data, error } = await createAdminSupabase()
      .storage.from('guides')
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data) return fail(404, 'not_found', 'That guide has not been uploaded yet.');

    const response = NextResponse.redirect(data.signedUrl, 302);
    // A signed URL is per request; a cached redirect would hand one reader's
    // grant to the next.
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    return unexpected(error);
  }
}
