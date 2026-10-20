import 'server-only';
import { createHash } from 'node:crypto';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { MAX_FILE_BYTES } from './validate';

export async function storedChecksum(path: string): Promise<string> {
  const { data, error } = await createAdminSupabase().storage.from('heritage').download(path);
  if (error || !data) throw new Error('checksum_storage_unavailable');
  if (data.size > MAX_FILE_BYTES) throw new Error('file_too_large');
  const hash = createHash('sha256');
  const reader = data.stream().getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      hash.update(value);
    }
  } finally { reader.releaseLock(); }
  return hash.digest('hex');
}
