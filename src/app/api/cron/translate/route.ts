import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { fail, ok, unexpected } from '@/lib/api';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { listLanguages } from '@/lib/translate/languages';
import { translateRecord } from '@/lib/translate';
import { needsTranslating, TRANSLATABLE_FIELDS, sourceHash } from '@/lib/translate/plan';

/**
 * The nightly sweep.
 *
 * Everything published is meant to be readable in every language the archive
 * publishes in. Three paths get it there, and this is the one that has to be
 * true without anybody doing anything:
 *
 * - a reader asks for a language and one record is translated on the spot;
 * - a volunteer accepts a record and it is translated into all of them;
 * - and once a day this finds whatever the other two missed and finishes it.
 *
 * Scheduled at 20:15 UTC, which is 23:15 in Israel — the end of the Center's
 * day rather than the end of Greenwich's. Vercel reads cron schedules as UTC
 * and says so nowhere near the schedule itself, so it is written down here.
 *
 * What it finds, in practice: records published before any of this existed;
 * records whose description a volunteer has corrected since, so the stored
 * translation no longer matches the text it was made from; and anything that
 * was skipped because the model was answering 503 at the time. It needs no
 * approval and asks for none — a translation is not a decision about the
 * archive, and a catalogue entry that is legible in Marathi tomorrow morning is
 * the point.
 *
 * ── it stops before the platform stops it ───────────────────────────────────
 *
 * A translation takes between two and fifty seconds on the free tier, and a
 * serverless function is killed at its limit with no chance to report. So this
 * works to a budget it sets itself, finishes the record it is on, and returns
 * how many are left — a run that ends by saying "eleven remaining" is a run
 * somebody can act on, and a run that is killed mid-record says nothing at all.
 * The backlog only ever shrinks, and the other two paths keep it small.
 *
 * ── it is not an open door ──────────────────────────────────────────────────
 *
 * It spends money, so it is a secret-bearer endpoint and nothing else. Vercel
 * Cron sends `Authorization: Bearer $CRON_SECRET`; without `CRON_SECRET` set,
 * this refuses every request rather than defaulting to open. Compared in
 * constant time, like the upload grants — a token checked with `===` leaks its
 * length and its prefix to anybody willing to measure.
 */

/**
 * Long enough to be useful, short enough to return before anything kills it.
 *
 * Forty-five seconds against a sixty-second `maxDuration`. The deadline is
 * handed all the way down to the model call itself, which is bounded by the
 * time actually left rather than merely checked before it starts — two earlier
 * versions overran, one to 2.6 minutes because the budget was only consulted
 * between records, and one to 57 seconds because a call that began inside the
 * budget was then allowed to run on past it.
 */
const BUDGET_MS = 45_000;
/** A ceiling on a single run whatever the clock says. */
const MAX_RECORDS = 25;

export const maxDuration = 60;

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // No secret configured is a closed door, not an open one.
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

    const started = Date.now();
    const deadline = started + BUDGET_MS;
    const admin = createAdminSupabase();
    const languages = (await listLanguages()).filter((l) => !l.is_source);

    if (languages.length === 0) return ok({ translated: [], remaining: 0, note: 'no languages configured' });

    const outstanding = await findOutstanding(admin, languages.map((l) => l.code));

    const translated: string[] = [];
    let stopped: 'finished' | 'budget' | 'quota' | 'cap' = 'finished';

    for (const itemId of outstanding) {
      if (translated.length >= MAX_RECORDS) {
        stopped = 'cap';
        break;
      }
      if (Date.now() > deadline) {
        stopped = 'budget';
        break;
      }

      try {
        const sweep = await translateRecord(itemId, { deadline });
        if (sweep.made.length) translated.push(itemId);
        /*
         * The free tier allows twenty model calls a minute, and a record is one
         * call per language. When that runs out, everything after it is refused
         * for the next half minute — so the run ends rather than spending its
         * remaining budget being told no. What was not reached is still
         * outstanding, and tomorrow's run starts with it.
         */
        if (sweep.quota) {
          stopped = 'quota';
          break;
        }
      } catch (error) {
        // One bad record does not end the run — the next one may be fine, and
        // this one is still outstanding tomorrow.
        console.error('[cron/translate]', itemId, error);
      }
    }

    return ok({
      translated: translated.length,
      remaining: Math.max(0, outstanding.length - translated.length),
      stopped,
      languages: languages.map((l) => l.code),
      ms: Date.now() - started,
    });
  } catch (error) {
    return unexpected(error);
  }
}

/**
 * Published records that are missing a current translation somewhere.
 *
 * "Missing" is not "has no row": a stored translation whose `source_hash` no
 * longer matches the text it was made from is stale, and stale is worse than
 * absent because it reads as correct. Both are found here, using the same
 * `needsTranslating` and `sourceHash` the on-demand path uses, so the sweep and
 * the reader can never disagree about what still needs doing.
 *
 * Oldest first, so a record that has been waiting since before any of this
 * existed is not permanently overtaken by this morning's uploads.
 */
async function findOutstanding(
  admin: ReturnType<typeof createAdminSupabase>,
  langs: string[],
): Promise<string[]> {
  const { data: items, error } = await admin
    .from('items')
    .select('id, title, description, provenance, period, origin_place')
    .eq('status', 'accepted')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) throw error;
  if (!items?.length) return [];

  const { data: rows } = await admin
    .from('item_translations')
    .select('item_id, lang, field, source_hash')
    .in('item_id', items.map((i) => i.id as string));

  const have = new Map<string, string>();
  for (const row of rows ?? []) {
    have.set(`${row.item_id}|${row.lang}|${row.field}`, row.source_hash as string);
  }

  const outstanding: string[] = [];
  for (const item of items) {
    const wanted = TRANSLATABLE_FIELDS.filter((field) => {
      // The transcript lives in ai_analyses and is fetched per record when the
      // record is actually translated; asking for it here would be a second
      // query per item to decide something the translator decides anyway.
      if (field === 'transcript') return false;
      const text = ((item as Record<string, unknown>)[field] ?? '').toString();
      return needsTranslating(text);
    });

    const short = langs.some((lang) =>
      wanted.some((field) => {
        const text = ((item as Record<string, unknown>)[field] ?? '').toString();
        return have.get(`${item.id}|${lang}|${field}`) !== sourceHash(text.trim());
      }),
    );

    if (short) outstanding.push(item.id as string);
  }

  return outstanding;
}
