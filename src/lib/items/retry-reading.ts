import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { readInBackground } from './background-reading';

/** Service-only claim function rechecks the item, actor, lease and counter. */
export async function retryOneReading(itemId: string | null, actorId: string | null, startedAt = Date.now()): Promise<boolean> {
  const { data, error } = await createAdminSupabase().rpc('claim_reading_retry', { p_item: itemId, p_actor: actorId });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return false;
  await readInBackground({
    itemId: row.item_id, title: row.title,
    files: [{ fileId: row.file_id, storagePath: row.storage_path, fileName: row.file_name,
      analysisId: row.analysis_id, retryCount: row.retry_count, lastRetryAt: row.last_retry_at }],
  }, startedAt);
  return true;
}
