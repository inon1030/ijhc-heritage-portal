/**
 * How much of today's model allowance is left.
 *
 *   npm run quota
 *
 * ── why this is not just a link to the dashboard ────────────────────────────
 *
 * AI Studio's rate-limit page shows *peak usage over 28 days*, which answers a
 * different question — it will happily show "7 / 5" from last Tuesday while
 * today is untouched. What somebody about to demo the archive needs to know is
 * how many calls are left in the next hour, and that page does not say.
 *
 * ── how it counts ───────────────────────────────────────────────────────────
 *
 * From the archive's own rows, because the Gemini API does not report a
 * remaining balance — you learn the limit by hitting it, which is exactly what
 * this exists to avoid.
 *
 *   cataloguing   one call per `ai_analyses` row
 *   translation   one call per DISTINCT (item, language) — a single call
 *                 writes up to five field rows, so counting rows would
 *                 overstate it fivefold
 *
 * ── the day starts in California ────────────────────────────────────────────
 *
 * The free-tier daily quota resets at midnight **US Pacific**, not local time.
 * In Israel that is 10:00 in summer and 09:00 in winter — so "yesterday's"
 * usage is still counted against you all morning, and a run that looks safe at
 * 09:00 can fail at 09:30. The window below is computed in Los Angeles time
 * rather than assumed, which is the whole reason this file does its own date
 * arithmetic instead of using `toISOString().slice(0, 10)`.
 *
 * It also *probes* each model with one real request, because a count is a
 * model of the truth and the answer from Google is the truth. That probe costs
 * one call, and it is reported.
 */
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

const ROOT = process.cwd();
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

/** Midnight in Los Angeles, as an instant. */
function pacificDayStart() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  // How far into the Pacific day we are, subtracted from now.
  const secondsIn = get('hour') * 3600 + get('minute') * 60 + get('second');
  return new Date(now.getTime() - secondsIn * 1000);
}

const DAILY = 20; // free tier, per model, per project

async function rows(table, select, since) {
  const r = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?select=${select}&created_at=gte.${since}`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!r.ok) throw new Error(`${table}: ${r.status}`);
  return r.json();
}

async function main() {
  const since = pacificDayStart();
  const local = since.toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem' });
  console.log(`\n  Quota day began ${local} Israel time (midnight in California).\n`);

  const [analyses, translations] = await Promise.all([
    rows('ai_analyses', 'model,created_at', since.toISOString()),
    rows('item_translations', 'item_id,lang,model,created_at', since.toISOString()),
  ]);

  const used = {};
  for (const a of analyses) used[a.model] = (used[a.model] ?? 0) + 1;

  // One call per (item, language); a call writes several field rows.
  const seen = new Set();
  for (const t of translations) {
    const key = `${t.item_id}|${t.lang}|${t.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    used[t.model] = (used[t.model] ?? 0) + 1;
  }

  /*
   * The chain, read from the file the site reads.
   *
   * This block used to hold its own copy of the default "and it has to stay
   * that way", said the comment. It did not: the site moved to seven models
   * and this went on reporting four, so the check under-reported by sixty
   * readings a day — and a quota check that under-reports is worse than none,
   * because it says "nearly out" on a day with plenty left. It had already
   * over-reported once, in the other direction, by listing an alias.
   *
   * Two copies of a value that must agree is the whole failure. There is one
   * copy now, in `src/lib/ai/models.json`, and both sides read it.
   */
  const chain = JSON.parse(
    fs.readFileSync(new URL('../src/lib/ai/models.json', import.meta.url), 'utf8'),
  );

  const models = [
    env.GEMINI_MODEL || chain.primary,
    ...(env.GEMINI_FALLBACK_MODELS || chain.fallbacks.join(','))
      .split(',')
      .map((m) => m.trim()),
  ].filter((m, i, a) => m && a.indexOf(m) === i);

  console.log('  model                      site used today   probe');
  console.log('  ─────────────────────────────────────────────────────────');

  const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  let anyOpen = false;

  for (const model of models) {
    const n = used[model] ?? 0;
    let probe;
    try {
      await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: 'ok' }] }],
      });
      probe = 'answering';
      anyOpen = true;
    } catch (e) {
      /*
       * Per minute and per day are both RESOURCE_EXHAUSTED, and they are not
       * the same news.
       *
       * This reported "allowance gone" for a burst that had merely tripped the
       * five-per-minute limit, so a model with fourteen readings left was
       * written off for the day. The quotaId says which — `...PerDay...` or
       * `...PerMinute...` — and a per-minute refusal clears itself in under a
       * minute, which is the difference between "come back tomorrow" and
       * "wait, then carry on".
       */
      const m = e?.message ?? '';
      const perDay = /PerDay/i.test(m);
      const perMinute = /PerMinute/i.test(m);
      const retry = /retryDelay[^0-9]*([0-9]+)/.exec(m)?.[1];
      probe = /prepayment/.test(m)
        ? 'REFUSED — prepay required'
        : perDay
          ? "REFUSED — today's allowance gone"
          : perMinute || /RESOURCE_EXHAUSTED/.test(m)
            ? `busy — too many just now${retry ? `, retry in ${retry}s` : ''}`
            : `REFUSED — ${e?.status ?? '?'}`;
      if (perMinute || (!perDay && /RESOURCE_EXHAUSTED/.test(m))) anyOpen = true;
    }
    const left = Math.max(0, DAILY - n - 1); // the probe above spent one
    console.log(
      `  ${model.padEnd(26)} ${String(n).padStart(2)} of ${DAILY}   ~${String(left).padStart(2)} left   ${probe}`,
    );
  }

  const other = Object.keys(used).filter((m) => !models.includes(m));
  if (other.length) {
    console.log('\n  also used today by models no longer configured:');
    for (const m of other) console.log(`    ${m.padEnd(26)} ${used[m]}`);
  }

  /*
   * What the left-hand column does not see, said out loud.
   *
   * "used today" is counted from rows the archive stored — one per
   * `ai_analyses`, one per translated field. Three kinds of call leave no row
   * and are invisible to it: a reading a contributor looked at and never
   * submitted, a pre-review language switch, and `npm run i18n`. On the day
   * this was written those alone were thirty-one calls the table showed as 0.
   *
   * The probe on the right is not a count — it is the answer from Google, and
   * it is the column to believe. A number that is quietly optimistic about
   * money is the same fault as a translation that is quietly wrong.
   */
  console.log(
    '\n  The count is of rows stored. Readings nobody submitted, language switches at\n' +
      '  pre-review and `npm run i18n` all spend the allowance and show here as 0 —\n' +
      '  the probe on the right is the answer from Google, and the one to trust.',
  );

  console.log(
    anyOpen
      ? '\n  ✅ At least one model is answering. Uploads will be read.\n'
      : '\n  ⚠️  Every model refused. Uploads still work — the contributor describes the item themselves.\n',
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
