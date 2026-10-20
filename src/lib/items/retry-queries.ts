import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { retryEligible } from './retry-policy';

export async function readRetryState(itemId: string) {
  const db = await createServerSupabase();
  const { data: item, error: itemError } = await db.from('items').select('status,deleted_at').eq('id', itemId).maybeSingle();
  if (itemError) throw itemError;
  if (!item || item.deleted_at || !['pending', 'shadow_gallery'].includes(item.status)) return [];
  const { data, error } = await db.from('ai_analyses')
    .select('id,file_id,status,retry_count,last_retry_at,created_at')
    .eq('item_id', itemId).order('created_at', { ascending: false }).order('id', { ascending: false });
  if (error) throw error;
  const seen = new Set<string>();
  return (data ?? []).filter((row) => {
    if (!row.file_id || seen.has(row.file_id)) return false;
    seen.add(row.file_id);
    return row.status === 'failed' || row.status === 'pending';
  }).map((row) => ({ id: row.id as string, count: row.retry_count as number,
    eligible: retryEligible(row), running: row.status === 'pending' &&
      Date.now() - Date.parse(row.last_retry_at ?? row.created_at) < 2 * 60 * 60_000 }));
}
