/**
 * A backup, because the plan does not come with one.
 *
 * The Supabase organisation is on the free plan: no automated backups, no
 * point-in-time recovery. Nothing on this project is recoverable today. That
 * matters more than it sounds — the database holds nineteen catalogued records
 * a person's judgement went into, and the bucket holds scans of family material
 * that in several cases will not exist anywhere else once the contributor's
 * copy is gone.
 *
 *   npx tsx scripts/backup.ts            # database + files
 *   npx tsx scripts/backup.ts --verify   # re-read the newest backup and count it
 *
 * Writes to backups/<timestamp>/ — deliberately outside the app, and outside
 * git (see .gitignore), because a backup inside the thing it backs up is not a
 * backup.
 */
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

/** Every table the archive's meaning lives in. Order is restore order. */
const TABLES = [
  'profiles',
  'contributors',
  'families',
  'keywords',
  'keyword_candidates',
  'items',
  'item_files',
  'item_fields',
  'item_families',
  'contributor_families',
  'ai_analyses',
  'item_events',
] as const;

const ROOT = 'backups';

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function backup() {
  const client = db();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(ROOT, stamp);
  mkdirSync(join(dir, 'files'), { recursive: true });

  const manifest: Record<string, number> = {};

  for (const table of TABLES) {
    const { data, error } = await client.from(table).select('*');
    if (error) throw new Error(`${table}: ${error.message}`);
    writeFileSync(join(dir, `${table}.json`), JSON.stringify(data ?? [], null, 2), 'utf8');
    manifest[table] = (data ?? []).length;
    console.log(`  ${table.padEnd(22)} ${(data ?? []).length} rows`);
  }

  /*
   * The files matter more than the rows.
   *
   * A row can be re-catalogued from the scan; a scan cannot be re-derived from
   * anything. Paths come from item_files rather than from listing the bucket,
   * so an orphan nobody has attached to a record is deliberately not carried
   * forward — a backup is of the archive, not of the upload folder.
   */
  const { data: files, error } = await client
    .from('item_files')
    .select('storage_path, preview_path');
  if (error) throw error;

  const paths = [
    ...new Set(
      (files ?? []).flatMap((f) =>
        [f.storage_path, f.preview_path].filter((p): p is string => Boolean(p)),
      ),
    ),
  ];

  let bytes = 0;
  let failed = 0;

  for (const path of paths) {
    const { data: blob, error: downloadError } = await client.storage.from('heritage').download(path);
    if (downloadError || !blob) {
      console.error(`  MISSING  ${path}  ${downloadError?.message ?? ''}`);
      failed += 1;
      continue;
    }
    const buffer = Buffer.from(await blob.arrayBuffer());
    // The storage path is a key with slashes; flatten it, keep it reversible.
    writeFileSync(join(dir, 'files', path.replace(/\//g, '__')), buffer);
    bytes += buffer.byteLength;
  }

  manifest['_files'] = paths.length - failed;
  manifest['_fileBytes'] = bytes;
  manifest['_filesMissing'] = failed;

  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\n  files                  ${paths.length - failed}/${paths.length}  (${(bytes / 1e6).toFixed(1)} MB)`);
  if (failed) console.log(`  ${failed} file(s) referenced by a record could not be downloaded.`);
  console.log(`\nwritten to ${dir}`);

  return { dir, failed };
}

/**
 * Reads the newest backup back and counts it.
 *
 * The point the skill makes and this proves: a file that exists is a claim, and
 * an unrestored backup is an untested one. This re-parses every table file and
 * re-reads every stored object off disk, so a truncated write or an unreadable
 * JSON is found here rather than on the night it is needed.
 */
function verify() {
  const runs = readdirSync(ROOT).filter((d) => statSync(join(ROOT, d)).isDirectory()).sort();
  if (!runs.length) throw new Error('No backup to verify.');

  const dir = join(ROOT, runs[runs.length - 1]);
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<string, number>;

  console.log(`verifying ${dir}\n`);
  let bad = 0;

  for (const table of TABLES) {
    const rows = JSON.parse(readFileSync(join(dir, `${table}.json`), 'utf8')) as unknown[];
    const ok = rows.length === manifest[table];
    if (!ok) bad += 1;
    console.log(`  ${ok ? 'ok  ' : 'BAD '} ${table.padEnd(22)} ${rows.length} rows (manifest says ${manifest[table]})`);
  }

  const stored = readdirSync(join(dir, 'files'));
  const bytes = stored.reduce((sum, f) => sum + statSync(join(dir, 'files', f)).size, 0);
  const filesOk = stored.length === manifest['_files'] && bytes === manifest['_fileBytes'];
  if (!filesOk) bad += 1;

  console.log(
    `  ${filesOk ? 'ok  ' : 'BAD '} ${'files'.padEnd(22)} ${stored.length} files, ${(bytes / 1e6).toFixed(1)} MB`,
  );

  const empty = stored.filter((f) => statSync(join(dir, 'files', f)).size === 0);
  if (empty.length) {
    bad += 1;
    console.log(`  BAD  ${empty.length} file(s) are zero bytes: ${empty.join(', ')}`);
  }

  console.log(`\n${bad === 0 ? 'PASS' : 'FAIL'}: ${bad} problem(s).`);
  if (bad) process.exitCode = 1;
}

async function main() {
  if (process.argv.includes('--verify')) return verify();
  const { failed } = await backup();
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
