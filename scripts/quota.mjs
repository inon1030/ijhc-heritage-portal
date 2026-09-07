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

  const models = [
    env.GEMINI_MODEL || 'gemini-3.6-flash',
    /*
     * The same default as `src/lib/env.ts`, and it has to stay that way.
     *
     * This file had a shorter list of its own, so it reported two models while
     * the site was using four — a quota check that under-reports is worse than
     * none, because it says "nearly out" on a day with sixty readings left.
     * It then briefly over-reported, listing an alias that resolves to a model
     * already in the list, which is the same failure pointing the other way.
     */
    ...(
      env.GEMINI_FALLBACK_MODELS ||
      'gemini-3.8-flash,gemini-3.5-flash-lite,gemini-3.7-flash'
    )
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
      const m = e?.message ?? '';
      probe = /prepayment/.test(m)
        ? 'REFUSED — prepay required'
        : /RESOURCE_EXHAUSTED|free_tier/.test(m)
          ? 'REFUSED — allowance gone'
          : `REFUSED — ${e?.status ?? '?'}`;
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
