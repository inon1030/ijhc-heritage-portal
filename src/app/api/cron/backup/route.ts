import { NextRequest } from 'next/server';
import { gzipSync } from 'node:zlib';
import { timingSafeEqual } from 'node:crypto';
import { fail, ok, unexpected } from '@/lib/api';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { destination, exists, put } from '@/lib/backup/s3';

/**
 * The nightly off-site copy.
 *
 * The Supabase organisation is on the free plan: no automated backups, no
 * point-in-time recovery. Until this existed the only copy of the archive was
 * the live database and a folder on one laptop, last written by hand — and the
 * bucket holds scans of family material that in several cases does not exist
 * anywhere else once the contributor's copy is gone.
 *
 * ── it copies to somewhere that is not Supabase and not Vercel ──────────────
 *
 * That is the whole point, so it is worth saying: a copy inside the same
 * project protects against a bad migration and against nothing else. The
 * destination is any S3-compatible store — R2, B2, S3 — configured entirely in
 * environment variables, so the archive is not married to one vendor and
 * moving it is a settings change rather than a deploy.
 *
 * ── what it writes ──────────────────────────────────────────────────────────
 *
 *   <prefix>/<date>/database.json.gz   every table, gzipped, one object
 *   <prefix>/files/<storage path>      each file, once, ever
 *
 * The database is written **fresh every night** and dated, so any night can be
 * restored and last night's mistake does not overwrite the good copy. Files are
 * content — an upload never changes after it lands — so they are copied once
 * and then skipped, which is what makes a nightly run affordable.
 *
 * ── it stops before the platform stops it ───────────────────────────────────
 *
 * Same shape as the translation sweep, for the same reason: a serverless
 * function is killed at its limit with nothing reported. It works to a budget,
 * finishes the object it is on, and returns how many are left. A run that ends
 * saying "forty remaining" is one somebody can act on; a killed run says
 * nothing at all. The backlog only shrinks, because files never change.
 */

export const maxDuration = 60;

const BUDGET_MS = 45_000;

/** Every table worth restoring. Order is the order a restore would insert in. */
const TABLES = [
  'archive_languages',
  'profiles',
  'contributors',
  'families',
  'contributor_families',
  'keywords',
  'keyword_translations',
  'items',
  'item_files',
  'item_fields',
  'item_families',
  'item_translations',
  'ai_analyses',
  'item_events',
] as const;

/**
 * A single file is not allowed to eat the whole run.
 *
 * The upload cap is 50 MB. Streaming one of those through a serverless
 * function costs both time and memory, so a file that will not fit inside
 * what is left of the budget is left for tomorrow rather than started and
 * killed halfway.
 */
const BIG_FILE_MS = 12_000;

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const offered = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(offered);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  try {
    if (!authorised(request)) {
      return fail(401, 'unauthenticated', 'This endpoint is for the scheduler.');
    }

    const to = destination();
    if (!to) {
      /*
       * Configured or not, this answers rather than throwing — "no off-site
       * store yet" is a real state and the archive should be able to say so
       * out loud instead of erroring into a log nobody reads at 20:15.
       */
      return ok({
        configured: false,
        note:
          'No off-site destination is set. Set BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, ' +
          'BACKUP_S3_ACCESS_KEY_ID and BACKUP_S3_SECRET_ACCESS_KEY to turn this on.',
      });
    }

    const started = Date.now();
    const deadline = started + BUDGET_MS;
    const prefix = (process.env.BACKUP_S3_PREFIX?.trim() || 'ijhc').replace(/^\/+|\/+$/g, '');
    const admin = createAdminSupabase();

    // ── the database, whole, dated ───────────────────────────────────────────
    const dump: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    for (const table of TABLES) {
      const rows = await readAll(admin, table);
      dump[table] = rows;
      counts[table] = rows.length;
    }

    const day = new Date().toISOString().slice(0, 10);
    const body = gzipSync(
      Buffer.from(
        JSON.stringify({ takenAt: new Date().toISOString(), counts, tables: dump }, null, 0),
        'utf8',
      ),
    );
    await put(to, `${prefix}/${day}/database.json.gz`, new Uint8Array(body), 'application/gzip');

    // ── the files, once each, oldest first ───────────────────────────────────
    const { data: files } = await admin
      .from('item_files')
      .select('storage_path, preview_path, byte_size, mime_type, created_at')
      .order('created_at', { ascending: true });

    const paths: { path: string; type: string; size: number }[] = [];
    for (const file of files ?? []) {
      paths.push({
        path: file.storage_path as string,
        type: (file.mime_type as string) ?? 'application/octet-stream',
        size: (file.byte_size as number) ?? 0,
      });
      if (file.preview_path) {
        paths.push({ path: file.preview_path as string, type: 'image/jpeg', size: 0 });
      }
    }

    let copied = 0;
    let skipped = 0;
    let remaining = 0;
    let stopped: 'finished' | 'budget' = 'finished';

    for (const file of paths) {
      if (Date.now() > deadline) {
        stopped = 'budget';
        remaining = paths.length - copied - skipped;
        break;
      }

      const key = `${prefix}/files/${file.path}`;
      try {
        if (await exists(to, key)) {
          skipped += 1;
          continue;
        }

        // A large file started too late is a killed function. Left for
        // tomorrow, which costs a day and never costs a half-written object.
        if (file.size > 8_000_000 && Date.now() + BIG_FILE_MS > deadline) {
          stopped = 'budget';
          remaining = paths.length - copied - skipped;
          break;
        }

        const { data, error } = await admin.storage.from('heritage').download(file.path);
        if (error || !data) throw error ?? new Error('no body');

        await put(to, key, new Uint8Array(await data.arrayBuffer()), file.type);
        copied += 1;
      } catch (error) {
        // One unreadable object does not end the run: the rest of the archive
        // is still worth copying, and this one is found again tomorrow.
        console.error('[cron/backup]', file.path, error);
        skipped += 1;
      }
    }

    return ok({
      configured: true,
      database: { key: `${prefix}/${day}/database.json.gz`, bytes: body.byteLength, counts },
      files: { copied, alreadyThere: skipped, remaining },
      stopped,
      ms: Date.now() - started,
    });
  } catch (error) {
    return unexpected(error);
  }
}

/**
 * Every row, in pages.
 *
 * Not `select('*')`. PostgREST caps a response at a thousand rows and returns
 * `error: null` when it does — measured on this project, a 2500-row table came
 * back as exactly a thousand. A backup that silently stopped at a thousand
 * rows would verify clean, restore clean, and be missing three fifths of the
 * archive.
 */
async function readAll(
  admin: ReturnType<typeof createAdminSupabase>,
  table: string,
): Promise<unknown[]> {
  const page = 1000;
  const rows: unknown[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await admin.from(table).select('*').range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < page) return rows;
  }
}
