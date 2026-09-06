/**
 * Translate the interface catalogue, once, into files a person can correct.
 *
 * Run with `npm run i18n`. Reads `src/lib/i18n/messages.ts` for the English,
 * writes `src/lib/i18n/locales/<code>.json` for every language in
 * `archive_languages` that is not the source.
 *
 * ── missing, and stale, are different problems ──────────────────────────────
 *
 * A key already present is left exactly as it is, including a correction
 * somebody made by hand — the archive's rule that a human correction outlives
 * the machine (decision 15) applies to the interface too.
 *
 * But **a key whose English has since been edited is not done, it is wrong**,
 * and it is the more dangerous of the two because it reads as finished. Caught
 * live: `prereview.heading` was changed from "What the archive found" to "What
 * the AI found" and the Hebrew page went on saying "מה שהארכיון מצא" with
 * nothing anywhere reporting a problem. The record translator has known this
 * since 0023 and stores a `source_hash` for exactly this reason; the interface
 * catalogue did not, so it learns the same lesson here.
 *
 * `locales/.sources.json` holds the hash of the English each translation was
 * made from. Different hash, translate again. Deleting a key from the JSON is
 * still how you ask for one back by hand.
 *
 * ── and it checks what comes back ───────────────────────────────────────────
 *
 * The same script check the record translator uses, for the same reason: a
 * model that loses the script mid-word returns `finishReason: STOP` and text
 * that looks like writing. Anything that fails is dropped rather than written,
 * and reported at the end, so a bad run leaves the catalogue smaller — never
 * wrong.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';

const ROOT = process.cwd();
const LOCALES = path.join(ROOT, 'src/lib/i18n/locales');
const SOURCES = path.join(LOCALES, '.sources.json');

const hash = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16);
const BATCH = 40;

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const SCRIPTS = {
  he: /\p{Script=Hebrew}/u,
  hi: /\p{Script=Devanagari}/u,
  mr: /\p{Script=Devanagari}/u,
  ml: /\p{Script=Malayalam}/u,
};
const ALWAYS = /[\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u;

function inScript(value, code) {
  const script = SCRIPTS[code];
  if (!script) return true;
  for (const character of value) {
    if (!/\p{Letter}/u.test(character)) continue;
    if (ALWAYS.test(character)) continue;
    if (!script.test(character)) return false;
  }
  return true;
}

/** The English catalogue, read out of the TypeScript rather than duplicated. */
function readEnglish() {
  const source = fs.readFileSync(path.join(ROOT, 'src/lib/i18n/messages.ts'), 'utf8');
  const body = source.slice(source.indexOf('export const en = {') + 'export const en = {'.length);
  const end = body.indexOf('\n} as const;');
  const entries = {};
  for (const m of body.slice(0, end).matchAll(/^\s*'([^']+)':\s*\n?\s*((?:'[^']*'|"[^"]*")(?:\s*\+\s*(?:'[^']*'|"[^"]*"))*)\s*,\s*$/gm)) {
    entries[m[1]] = m[2]
      .split(/\s*\+\s*/)
      .map((piece) => piece.slice(1, -1))
      .join('')
      .replace(/\'/g, "'");
  }
  return entries;
}

async function languages() {
  const r = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/archive_languages?select=code,label_en,is_source,enabled&enabled=is.true&order=position`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } },
  );
  return (await r.json()).filter((l) => !l.is_source);
}

const INSTRUCTIONS = (label) => `You are translating the interface of a digital heritage archive for the
Indian Jewish communities — Bene Israel, Cochin, Baghdadi and Bnei Menashe — into ${label}.

Rules:
- Translate the VALUE of each key. Never translate or alter the key.
- Keep every {placeholder} exactly as it appears, spelled the same way.
- "Indian Jewish Heritage Center" and "IJHC" are the organisation's registered
  name. Leave both exactly as they are, in Latin script.
- The community names — Bene Israel, Cochin, Baghdadi, Bnei Menashe — ARE to be
  rendered in ${label}'s own script, using the form a reader of ${label} would
  expect. A Cochin reader meeting "Cochin" set in Latin inside a Malayalam
  sentence is the one word they have most right to see in their own script.
- These are buttons, labels and short notices. Match the register: plain,
  calm, and as short as the English. A button label stays a button label.
- Write entirely in ${label}'s own script, except for proper nouns kept above.
- Return JSON only.`;

async function main() {
  const english = readEnglish();
  const keys = Object.keys(english);
  console.log(`English catalogue: ${keys.length} strings`);

  // key -> hash of the English it was translated from, per language.
  const sources = fs.existsSync(SOURCES) ? JSON.parse(fs.readFileSync(SOURCES, 'utf8')) : {};

  const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

  /*
   * Several models, best first, because the free tier's allowance is **per
   * model**: twenty requests a day each, and the interface catalogue is a few
   * hundred strings that all want translating on the same afternoon.
   *
   * Using the weaker models here is safe in a way it is not for records,
   * and the difference is this script's own checking. Every string that comes
   * back must be in the target's script and must still carry its placeholders;
   * anything else is dropped and reported. A model having a bad day therefore
   * leaves keys *missing* — and a missing key falls back to English — rather
   * than leaving the archive with a Malayalam menu label that is not Malayalam.
   * That is the whole reason the catalogue lives in files instead of being
   * generated per request.
   */
  const models = (env.I18N_MODELS || 'gemini-3.6-flash,gemini-3.5-flash-lite,gemini-flash-lite-latest')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  const exhausted = new Set();
  const targets = await languages();
  let calls = 0;

  for (const language of targets) {
    const file = path.join(LOCALES, `${language.code}.json`);
    const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};

    // A string removed from the English is not a translation any more, it is a
    // file that never shrinks.
    for (const key of Object.keys(existing)) if (!(key in english)) delete existing[key];

    const seen = (sources[language.code] ??= {});

    /*
     * And a string whose English has been edited since is worse than missing:
     * it reads as finished while saying the old thing. Dropped, so the pass
     * below remakes it.
     */
    const stale = keys.filter((k) => existing[k] && seen[k] && seen[k] !== hash(english[k]));
    for (const key of stale) delete existing[key];
    if (stale.length) console.log(`  ${language.code}  ${stale.length} stale (English edited): ${stale.slice(0, 4).join(', ')}${stale.length > 4 ? '…' : ''}`);

    /*
     * Stamped before the early exit below, not after it.
     *
     * The stamping used to live at the end of the loop — past a `continue` that
     * fires whenever a language is already complete, which is most runs. So the
     * sidecar was never written at all, and the stale detection this whole
     * block exists for could never fire. Found by looking for the file and not
     * finding it; nothing in the run said anything was wrong.
     */
    const stamp = () => {
      for (const key of Object.keys(existing)) seen[key] ??= hash(english[key]);
      for (const key of Object.keys(seen)) if (!(key in existing)) delete seen[key];
      fs.writeFileSync(SOURCES, JSON.stringify(sources, null, 2) + '\n', 'utf8');
    };

    const missing = keys.filter((k) => !existing[k]);
    if (!missing.length) {
      stamp();
      console.log(`  ${language.code}  complete (${keys.length})`);
      continue;
    }

    let added = 0;
    const rejected = [];
    /*
     * Passes, not one sweep. A batch can come back short or be dropped for a
     * bad script, and the keys it missed are simply still missing — so the
     * whole list is walked again until a pass adds nothing. Three passes is
     * enough for a model having a bad minute and few enough to stop.
     */
    for (let pass = 0; pass < 3; pass += 1) {
    const outstanding = keys.filter((k) => !existing[k]);
    if (!outstanding.length) break;
    const before = added;
    for (let i = 0; i < outstanding.length; i += BATCH) {
      const slice = outstanding.slice(i, i + BATCH);
      const properties = Object.fromEntries(slice.map((k) => [k, { type: Type.STRING }]));
      const model = models.find((m) => !exhausted.has(m));
      if (!model) {
        console.log(`  ${language.code}  every model is out of quota for today`);
        break;
      }

      let produced;
      try {
        const response = await client.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: JSON.stringify(Object.fromEntries(slice.map((k) => [k, english[k]]))) }] }],
          config: {
            systemInstruction: INSTRUCTIONS(language.label_en),
            responseMimeType: 'application/json',
            /*
             * `required` is not optional here. Asked for forty keys with the
             * properties merely declared, the model returned seven — and the
             * run reported success, because a partial object is valid JSON
             * against a schema whose fields are all optional. Measured on the
             * first run of this script: he 7/29, hi 9/29, mr 7/29, ml 29/29.
             * Naming every key as required turns "answered less" into an
             * error the retry below can act on.
             */
            responseSchema: { type: Type.OBJECT, properties, required: slice },
            temperature: 0,
          },
        });
        calls += 1;
        if (!response.text) throw new Error(`no text (${response.candidates?.[0]?.finishReason})`);
        produced = JSON.parse(response.text);
      } catch (error) {
        // 429 is the day's allowance for *that model*, gone. Retrying it is
        // three calls spent hearing the same answer; the next model has its
        // own allowance, and everything it returns is checked the same way.
        if (error.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(error.message ?? '')) {
          exhausted.add(model);
          console.log(`  ${language.code}  ${model} is out of quota — moving on`);
          i -= BATCH; // the batch was not done; try it on the next model
          continue;
        }
        console.log(`  ${language.code}  pass ${pass + 1} batch ${i / BATCH + 1}: ${error.message}`);
        continue;
      }

      for (const [key, value] of Object.entries(produced)) {
        if (typeof value !== 'string' || !value.trim()) continue;
        if (!inScript(value, language.code)) {
          rejected.push([key, value]);
          continue;
        }
        // A placeholder the model dropped would render as a hole in a sentence.
        const wanted = [...english[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        if (wanted.some((name) => !value.includes(`{${name}}`))) {
          rejected.push([key, `${value}  ← lost {${wanted.join('} {')}}`]);
          continue;
        }
        existing[key] = value.trim();
        seen[key] = hash(english[key]);
        added += 1;
      }
    }
    if (added === before) break;
    }

    const ordered = Object.fromEntries(keys.filter((k) => existing[k]).map((k) => [k, existing[k]]));
    fs.writeFileSync(file, JSON.stringify(ordered, null, 2) + '\n', 'utf8');
    console.log(`  ${language.code}  +${added}  (${Object.keys(ordered).length}/${keys.length})${rejected.length ? `  rejected ${rejected.length}` : ''}`);
    for (const [key, value] of rejected) console.log(`      ✗ ${key}: ${value.slice(0, 90)}`);
  }

  console.log(`\n${calls} model calls.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
