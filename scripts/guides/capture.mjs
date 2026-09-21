/**
 * Captures the screenshots the guides are built from, and measures where to
 * put the rings.
 *
 *   node scripts/guides/capture.mjs [--audience contributor|expert|admin] [--lang he|en] [--explore]
 *
 * Runs against the site on http://localhost:3000 (start it first). For every
 * step in `steps.mjs` it drives the real page into the right state, takes a
 * screenshot, and records the box of each control the step points at. Two
 * outputs from one pass, so the picture and the ring can never disagree:
 *
 *   - `DOCS/guides-build/shots/<audience>/<lang>/<id>.png`  the screenshot
 *   - `src/lib/guides/shots.json`                           size + ring boxes
 *
 * The walkthrough on /guides draws the ring over the plain screenshot; the PDF
 * builder (`DOCS/_build/build_role_guides.py`) draws numbered rings into it.
 *
 * ── nothing real is sent ────────────────────────────────────────────────────
 *
 * The contribution flow is driven with its network calls answered here: the
 * upload URL, the storage PUT, the AI reading and the final submit. So a
 * capture run writes nothing to the database, spends none of the day's Gemini
 * allowance, and always shows the same example - the Gubbay five-rupee note,
 * which is a published record, with the reading the archive actually made of it.
 *
 * The knowledge-expert and administrator screens need a signed-in session. The
 * script never signs in; it reuses cookies from `DOCS/guides-build/session.json`
 * if a person has saved one there (see README.md in this folder), and skips
 * those audiences otherwise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { STEPS } from './steps.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = path.resolve(ROOT, '..', 'DOCS', 'guides-build', 'shots');
const SESSION = path.resolve(ROOT, '..', 'DOCS', 'guides-build', 'session.json');
const SHOTS_JSON = path.join(ROOT, 'src', 'lib', 'guides', 'shots.json');
const BASE = process.env.GUIDES_BASE ?? 'http://localhost:3000';
const VIEWPORT = { width: 1280, height: 800 };

const args = process.argv.slice(2);
const pick = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const onlyAudience = pick('--audience');
const onlyLang = pick('--lang');
const onlyStep = pick('--step');

/**
 * People's names, to be replaced on the signed-in screens.
 *
 * Read with the service key straight into memory and never written or printed:
 * account holders, and contributors who left a name. The Center's own guide
 * replaced every name and address in its screenshots with an example, and a
 * contributor's name is not the Center's to publish in a manual.
 */
async function peoplesNames() {
  const env = Object.fromEntries(
    fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const names = new Set();
  for (const [table, column] of [['profiles', 'full_name'], ['contributors', 'full_name'], ['items', 'contributor_full_name']]) {
    const { data } = await db.from(table).select(column).not(column, 'is', null).limit(1000);
    for (const row of data ?? []) if (row[column]?.trim().length >= 3) names.add(row[column].trim());
  }
  // Longest first, so "Ruth Elias Cohen" is replaced before "Ruth Elias".
  return [...names].sort((a, b) => b.length - a.length);
}

const shots = fs.existsSync(SHOTS_JSON) ? JSON.parse(fs.readFileSync(SHOTS_JSON, 'utf8')) : {};
const browser = await chromium.launch();
const NAMES = onlyAudience === 'contributor' ? [] : await peoplesNames();

for (const [audience, steps] of Object.entries(STEPS)) {
  if (onlyAudience && audience !== onlyAudience) continue;
  let session = null;
  if (audience !== 'contributor') {
    if (!fs.existsSync(SESSION)) {
      console.log(`${audience}: skipped - no saved session at ${path.relative(ROOT, SESSION)}`);
      continue;
    }
    session = JSON.parse(fs.readFileSync(SESSION, 'utf8'));
  }

  for (const lang of ['he', 'en']) {
    if (onlyLang && lang !== onlyLang) continue;
    // Reduced motion also keeps the front door's four-second passage off every screenshot.
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, reducedMotion: 'reduce', locale: lang === 'he' ? 'he-IL' : 'en-GB' });
    await context.addCookies([
      { name: 'ijhc.lang', value: lang, url: BASE },
      { name: 'ijhc.stats', value: 'declined', url: BASE },
      ...(session?.cookies ?? []).map((c) => ({ ...c, url: BASE, domain: undefined, path: undefined })),
    ]);
    const page = await context.newPage();
    const ctx = { page, lang, base: BASE, fixture: path.join(HERE, 'fixtures', 'gubbay-5-rupees.jpg') };

    for (const step of steps) {
      if (onlyStep && step.id !== onlyStep) {
        // A step's state can depend on the ones before it, so they still run.
        await step.go(ctx);
        continue;
      }
      await step.go(ctx);
      await page.addStyleTag({ content: '.passage, nextjs-portal { display: none !important; } *{caret-color: transparent !important}' });
      await page.waitForTimeout(450);
      if (audience !== 'contributor') {
        // Live screens carry real contributors' addresses. The Center's own
        // guides replaced them with examples; so does this, before the picture.
        await page.evaluate((names) => {
          const escape = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const person = names.length ? new RegExp(names.map(escape).join('|'), 'gi') : null;
          const email = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
          const has = (v) => /[\w.+-]+@[\w-]+\.[\w-]+/.test(v);
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let n = 0;
          while (walker.nextNode()) {
            const node = walker.currentNode;
            if (has(node.nodeValue)) node.nodeValue = node.nodeValue.replace(email, () => `contributor${++n}@example.com`);
            if (person && person.test(node.nodeValue)) {
              person.lastIndex = 0;
              node.nodeValue = node.nodeValue.replace(person, () => `Example Person ${++n}`);
            }
            if (person) person.lastIndex = 0;
          }
          for (const input of document.querySelectorAll('input')) {
            if (has(input.value)) input.value = input.value.replace(email, 'contributor@example.com');
            if (person && person.test(input.value)) input.value = input.value.replace(person, 'Example Person');
            if (person) person.lastIndex = 0;
          }
        }, NAMES);
      }

      const spots = [];
      for (const find of step.spots ?? []) {
        const locator = find(page, lang);
        const box = await locator.first().boundingBox().catch(() => null);
        if (!box) {
          console.log(`  ! ${audience}/${lang}/${step.id}: a ring target was not found`);
          continue;
        }
        const pad = 6;
        spots.push({
          x: +(((box.x - pad) / VIEWPORT.width) * 100).toFixed(2),
          y: +(((box.y - pad) / VIEWPORT.height) * 100).toFixed(2),
          w: +(((box.width + pad * 2) / VIEWPORT.width) * 100).toFixed(2),
          h: +(((box.height + pad * 2) / VIEWPORT.height) * 100).toFixed(2),
        });
      }

      const dir = path.join(OUT, audience, lang);
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${step.id}.png`) });
      shots[audience] ??= {};
      shots[audience][step.id] ??= {};
      shots[audience][step.id][lang] = { width: VIEWPORT.width * 2, height: VIEWPORT.height * 2, spots };
      console.log(`${audience}/${lang}/${step.id}: ${spots.length} ring(s)`);
    }
    await context.close();
  }
}

await browser.close();
fs.writeFileSync(SHOTS_JSON, JSON.stringify(shots, null, 2) + '\n');
console.log('wrote', path.relative(ROOT, SHOTS_JSON));
