/**
 * Checks what the database says about each stored file against what the file's
 * own bytes say, and corrects the record.
 *
 * Replaces scripts/backfill-dimensions.mjs, which only filled in missing
 * dimensions. That was not enough: one of the demo images is named
 * `kachori.jpeg` and is actually a WebP, so it had been stored as `image/jpeg`,
 * and the dimension reader — correctly — refused to parse WebP bytes as JPEG
 * and returned null. Fixing the type is what makes the measurement possible.
 *
 * Reports first, writes only with --apply.
 *
 *   npm run db:reconcile
 *   npm run db:reconcile -- --apply
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolveMimeType } from '../src/lib/files/detect';
import { readImageDimensions } from '../src/lib/files/dimensions';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey || url.includes('placeholder')) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: files, error } = await supabase
    .from('item_files')
    .select('id, storage_path, file_name, mime_type, width, height');

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  console.log(`${files.length} stored file(s)\n`);

  let corrected = 0;
  let unreadable = 0;

  for (const file of files) {
    const name = file.file_name ?? file.storage_path.split('/').pop();

    const { data: blob } = await supabase.storage.from('heritage').download(file.storage_path);
    if (!blob) {
      console.log(`  unreadable   ${name}`);
      unreadable += 1;
      continue;
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mimeType = resolveMimeType(bytes, file.mime_type);
    const dimensions = readImageDimensions(bytes, mimeType);

    const changes: Record<string, unknown> = {};
    if (mimeType !== file.mime_type) changes.mime_type = mimeType;
    if (dimensions && (dimensions.width !== file.width || dimensions.height !== file.height)) {
      changes.width = dimensions.width;
      changes.height = dimensions.height;
    }

    if (Object.keys(changes).length === 0) {
      continue;
    }

    const parts: string[] = [];
    if (changes.mime_type) parts.push(`${file.mime_type} → ${mimeType}`);
    if (changes.width) parts.push(`${file.width ?? '?'}×${file.height ?? '?'} → ${dimensions!.width}×${dimensions!.height}`);
    console.log(`  ${APPLY ? 'corrected' : 'would fix'}  ${name}  (${parts.join(', ')})`);

    if (APPLY) {
      const { error: updateError } = await supabase.from('item_files').update(changes).eq('id', file.id);
      if (updateError) {
        console.error(`    update failed — ${updateError.message}`);
        continue;
      }

      // The bytes in storage carry a content type too, and it was served from the
      // same wrong claim. Re-uploading with the right one keeps them in step.
      if (changes.mime_type) {
        const { error: storageError } = await supabase.storage
          .from('heritage')
          .update(file.storage_path, bytes, { contentType: mimeType, upsert: true });
        if (storageError) console.error(`    storage content-type unchanged — ${storageError.message}`);
      }
    }

    corrected += 1;
  }

  const verb = APPLY ? 'corrected' : 'to correct';
  console.log(`\n${corrected} ${verb}, ${files.length - corrected - unreadable} already accurate, ${unreadable} unreadable.`);
  if (corrected && !APPLY) console.log('Nothing written. Re-run with --apply.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
