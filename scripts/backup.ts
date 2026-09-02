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
 *
 * ── the bug this file shipped with, and what it changed ─────────────────────
 *
 * The first version read each table with `select('*')` and no pagination.
 * PostgREST caps a response at 1000 rows and **returns no error** when it does:
 * measured on this project, a 2500-row table came back as exactly 1000 rows
 * with `error: null`, while `count: 'exact'` reported 2500.
 *
 * It then recorded `manifest[table] = data.length` — the truncated number — and
 * `--verify` compared the truncated file against the truncated manifest and
 * printed PASS. A backup silently missing three fifths of a table, certified
 * complete by its own checker, on the night somebody needed it.
 *
 * Two changes follow, and the second matters more than the first:
 *
 *   every read is paginated, so nothing is silently dropped; and
 *   **`--verify` counts the live database, not the manifest.** A checker that
 *   validates a file against a number the same file produced can only ever
 *   agree with itself. It now asks Postgres how many rows there are and
 *   compares that with what is on disk, so a short backup is a FAIL.
 *
 * Found by an independent review that had not seen this file being written —
 * which is the argument for having one.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
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

/** PostgREST's per-response cap on this project, measured rather than assumed. */
const PAGE = 1000;

/**
 * Every row of a table, however many pages that takes.
 *
 * `.range()` is inclusive at both ends. The loop stops on a short page rather
 * than on a row count, so it terminates correctly whether or not the total is a
 * multiple of the page size.
 */
async function readAll(
  client: ReturnType<typeof db>,
  table: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from(table).select('*').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);

    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if ((data ?? []).length < PAGE) return rows;
  }
}

/** What the database says it holds. The number `--verify` is judged against. */
async function liveCount(client: ReturnType<typeof db>, table: string): Promise<number> {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

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

  let short = 0;

  for (const table of TABLES) {
    const rows = await readAll(client, table);
    const expected = await liveCount(client, table);

    writeFileSync(join(dir, `${table}.json`), JSON.stringify(rows, null, 2), 'utf8');
    manifest[table] = rows.length;
    // What the database held when this ran, from `count: 'exact'` — which is
    // not subject to the response cap. This is the number that makes a
    // truncated backup detectable later: without it, a short file is
    // indistinguishable from a backup the database has simply moved past.
    manifest[`${table}__expected`] = expected;

    // Checked at write time as well as at verify time. A short read here means
    // rows arrived between the two calls, or that pagination is broken — either
    // way the operator should hear it now, not in six months.
    const ok = rows.length === expected;
    if (!ok) short += 1;
    console.log(
      `  ${ok ? '    ' : 'SHORT'} ${table.padEnd(22)} ${rows.length} rows${ok ? '' : ` (database says ${expected})`}`,
    );
  }

  /*
   * The files matter more than the rows.
   *
   * A row can be re-catalogued from the scan; a scan cannot be re-derived from
   * anything. Paths come from item_files rather than from listing the bucket,
   * so an orphan nobody has attached to a record is deliberately not carried
   * forward — a backup is of the archive, not of the upload folder.
   */
  // Paginated for the same reason: past a thousand files the scans would simply
  // stop being downloaded, and the manifest would have agreed.
  const files = (await readAll(client, 'item_files')) as {
    storage_path: string;
    preview_path: string | null;
  }[];

  const paths = [
    ...new Set(
      files.flatMap((f) => [f.storage_path, f.preview_path].filter((p): p is string => Boolean(p))),
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
  if (short) console.log(`${short} table(s) came back short. Do not rely on this run.`);

  return { dir, failed: failed + short };
}

/**
 * Reads the newest backup back and checks it against the database.
 *
 * A file that exists is a claim, and an unrestored backup is an untested one.
 * This re-parses every table file and re-reads every stored object off disk, so
 * a truncated write or an unreadable JSON is found here rather than on the
 * night it is needed.
 *
 * The counts come from Postgres, not from the manifest. The first version
 * compared the file with a number the file itself had produced, which agrees
 * with itself no matter how wrong both are — the single reason a silently
 * truncated backup could have passed.
 */
async function verify() {
  if (!existsSync(ROOT)) throw new Error('No backup to verify — backups/ does not exist.');

  // Newest run that actually finished. A run that threw mid-way leaves table
  // files and no manifest; skipping those means --verify reports on the last
  // good backup rather than throwing on the broken one.
  const runs = readdirSync(ROOT)
    .filter((d) => statSync(join(ROOT, d)).isDirectory())
    .filter((d) => existsSync(join(ROOT, d, 'manifest.json')))
    .sort();

  if (!runs.length) throw new Error('No completed backup to verify.');

  const dir = join(ROOT, runs[runs.length - 1]);
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<string, number>;

  console.log(`verifying ${dir}`);
  console.log('counts are read from the database, not from the manifest\n');

  const client = db();
  let bad = 0;

  for (const table of TABLES) {
    const rows = JSON.parse(readFileSync(join(dir, `${table}.json`), 'utf8')) as unknown[];
    const live = await liveCount(client, table);

    /*
     * Three numbers, and the middle one is the load-bearing one.
     *
     *   rows      what is on disk now
     *   expected  what the database held when the backup ran
     *   live      what it holds today
     *
     * A backup is short if it holds fewer rows than the database had at the
     * moment it was taken. Comparing against `live` instead cannot tell a
     * truncated backup from an old one — which is how the first attempt at
     * this fix still passed a file missing more than half a table.
     *
     * `expected` is absent on runs written before this was added; those fall
     * back to the weaker check and are marked so, rather than silently
     * counting as fine.
     */
    const expected = manifest[`${table}__expected`];
    const known = typeof expected === 'number';

    const short = known ? rows.length < expected : rows.length !== manifest[table];
    const corrupt = rows.length !== manifest[table];
    const stale = known && live > expected;

    if (short || corrupt) bad += 1;

    const mark = short || corrupt ? 'BAD ' : stale ? 'old ' : known ? 'ok  ' : '??  ';
    console.log(
      `  ${mark} ${table.padEnd(22)} ${rows.length} on disk` +
        (known ? `, ${expected} when taken` : ', taken before this check existed') +
        `, ${live} live` +
        (corrupt ? `  (manifest claimed ${manifest[table]})` : ''),
    );
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
  console.log('"old" means the database has grown since this run — the file is complete for its date.');
  if (bad) process.exitCode = 1;
}

async function main() {
  if (process.argv.includes('--verify')) return await verify();
  const { failed } = await backup();
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
