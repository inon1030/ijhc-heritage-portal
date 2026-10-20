/**
 * Manual only. Dry run by default. Uses the operator's environment, never an
 * .env file. Run with --apply only after migration 0034 has been applied.
 */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Configure the Supabase environment before running this script.');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const apply = process.argv.includes('--apply');
  let cursor: string | undefined;
  let checked = 0;
  let failed = 0;
  for (;;) {
    let query = db.from('item_files').select('id,item_id,storage_path').is('checksum', null).order('id').limit(100);
    if (cursor) query = query.gt('id', cursor);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    for (const file of data) {
      cursor = file.id;
      try {
        const { data: blob, error: downloadError } = await db.storage.from('heritage').download(file.storage_path);
        if (downloadError || !blob) throw new Error('download_failed');
        const hash = createHash('sha256');
        const reader = blob.stream().getReader();
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            hash.update(value);
          }
        } finally { reader.releaseLock(); }
        const checksum = hash.digest('hex');
        if (apply) {
          const { error: updateError } = await db.from('item_files').update({ checksum }).eq('id', file.id).is('checksum', null);
          if (updateError) throw updateError;
          const { error: flagError } = await db.rpc('flag_item_duplicates', { p_item_id: file.item_id });
          if (flagError) throw flagError;
        }
        checked++;
      } catch {
        failed++;
        console.error('Could not checksum file', file.id);
      }
    }
  }
  console.info({ mode: apply ? 'apply' : 'dry-run', checked, failed });
  if (failed) process.exitCode = 1;
}
void main().catch(() => { console.error('Checksum backfill failed.'); process.exitCode = 1; });
