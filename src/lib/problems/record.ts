import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';

/** Rows older than this are deleted by the next write. The privacy page says ninety days. */
export const KEEP_DAYS = 90;

export interface ProblemRow {
  code: string;
  source: 'server' | 'browser';
  place?: string | null;
  path?: string | null;
  message: string;
  detail?: string | null;
  userAgent?: string | null;
  profileId?: string | null;
}

/**
 * Writes one problem, and never throws.
 *
 * It is called from inside failures. A log that can fail the request it is
 * logging would turn one fault into two, so every error here is swallowed and
 * printed — the platform log still has it.
 */
export async function recordProblem(row: ProblemRow): Promise<void> {
  try {
    const supabase = createAdminSupabase();
    const { error } = await supabase.from('problems').insert({
      code: row.code,
      source: row.source,
      place: row.place?.slice(0, 120) ?? null,
      path: row.path?.slice(0, 300) ?? null,
      message: row.message.slice(0, 1000),
      detail: row.detail?.slice(0, 4000) ?? null,
      user_agent: row.userAgent?.slice(0, 300) ?? null,
      profile_id: row.profileId ?? null,
    });
    if (error) console.error('[problems] not recorded:', error.message);

    const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
    await supabase.from('problems').delete().lt('created_at', cutoff);
  } catch (error) {
    console.error('[problems] not recorded:', error);
  }
}
