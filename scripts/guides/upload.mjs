/**
 * Uploads the guides to the private `guides` bucket.
 *
 *   node scripts/guides/upload.mjs [pdf|video|steps]...
 *
 * Reads from the project's DOCS folder, next to this repository:
 *
 *   DOCS/videos/*.mp4                       -> video/<audience>-<lang>.mp4
 *   DOCS/guides-build/pdf/*.pdf             -> pdf/<audience>-<lang>.pdf
 *   DOCS/guides-build/shots/<a>/<lang>/*.png -> steps/<a>/<lang>/<id>.png
 *
 * Upserts, so running it again after a new capture replaces what is there.
 * Uses the service-role key from .env.local; nothing here runs in a browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DOCS = path.resolve(ROOT, '..', 'DOCS');

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// The Center's video files keep their own names in DOCS; this is the map.
const VIDEOS = {
  'IJHC מדריך לתורמים - עברית (7m06s).mp4': 'video/contributor-he.mp4',
  'IJHC Contributor Guide - English (4m39s).mp4': 'video/contributor-en.mp4',
  'IJHC מדריך למודרטורים - עברית (9m50s).mp4': 'video/expert-he.mp4',
  'IJHC Moderator Guide - English (7m07s).mp4': 'video/expert-en.mp4',
};

const kinds = process.argv.slice(2);
const want = (k) => kinds.length === 0 || kinds.includes(k);
const jobs = [];

if (want('video')) {
  for (const [name, dest] of Object.entries(VIDEOS)) jobs.push([path.join(DOCS, 'videos', name), dest, 'video/mp4']);
}
if (want('pdf')) {
  const dir = path.join(DOCS, 'guides-build', 'pdf');
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.pdf'))) jobs.push([path.join(dir, f), `pdf/${f}`, 'application/pdf']);
}
if (want('steps')) {
  const dir = path.join(DOCS, 'guides-build', 'shots');
  if (fs.existsSync(dir))
    for (const audience of fs.readdirSync(dir))
      for (const lang of fs.readdirSync(path.join(dir, audience)))
        for (const f of fs.readdirSync(path.join(dir, audience, lang)).filter((f) => f.endsWith('.png')))
          jobs.push([path.join(dir, audience, lang, f), `steps/${audience}/${lang}/${f}`, 'image/png']);
}

let failed = 0;
for (const [src, dest, contentType] of jobs) {
  if (!fs.existsSync(src)) {
    console.log('missing', src);
    failed++;
    continue;
  }
  const body = fs.readFileSync(src);
  const { error } = await supabase.storage.from('guides').upload(dest, body, { contentType, upsert: true });
  if (error) {
    console.log('FAILED', dest, error.message);
    failed++;
  } else console.log('ok', dest, `${(body.length / 1048576).toFixed(1)} MB`);
}
process.exit(failed ? 1 : 0);
