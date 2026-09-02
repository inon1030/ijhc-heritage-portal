/**
 * Runs the real AI provider over every file in scripts/seed-assets/ and caches
 * the result to scripts/seed-analysis.json.
 *
 * Kept separate from seeding for two reasons. It costs API calls, so it should
 * not run every time the database is reset. And more importantly, a person
 * reads the output before deciding what gets published — which is the same rule
 * the product enforces on every other record.
 *
 *   npx tsx scripts/analyze-assets.ts
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';

config({ path: '.env.local' });

const ASSET_DIR = path.join(process.cwd(), 'scripts', 'seed-assets');
const OUTPUT = path.join(process.cwd(), 'scripts', 'seed-analysis.json');

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/** Titles and categories as the contributors actually entered them in the demo. */
const CONTEXT: Record<string, { title: string; category: 'material_culture' | 'documents' | 'oral_histories' }> = {
  'lady-ezra-group.png': { title: 'Lady Ezra with group', category: 'material_culture' },
  'ezra-clipping.jpeg': { title: 'Sir David Ezra, newspaper greeting', category: 'documents' },
  'asf-bollywood-poster.jpeg': { title: 'Bollywood poster', category: 'material_culture' },
  'kachori.jpeg': { title: 'Kachori, spiced pea dumpling', category: 'material_culture' },
  'baghdadi-religious-book.jpeg': { title: 'Baghdadi Jewish religious book', category: 'documents' },
  'ketuba.jpg': { title: 'Ketubah', category: 'documents' },
  'jewish-family-group.jpg': { title: 'Indian Jewish family photograph', category: 'material_culture' },
  'ketuba-detail.jpg': { title: 'Ketubah, detail', category: 'documents' },
  'synagogue-exterior.webp': { title: 'Calcutta synagogue', category: 'material_culture' },
};

async function main() {
  const { getAIProvider } = await import('../src/lib/ai/index.js');
  const provider = getAIProvider();

  if (provider.isSimulated) {
    console.error('No GEMINI_API_KEY set. This script only makes sense with the real provider.');
    process.exit(1);
  }

  console.log(`Analysing with ${provider.id}/${provider.model}\n`);

  const files = (await readdir(ASSET_DIR)).filter((f) => MIME[path.extname(f).toLowerCase()]);

  // Resume rather than restart: a 503 on one file should not cost another eight
  // API calls to recover from.
  const results: Record<string, unknown> = existsSync(OUTPUT)
    ? JSON.parse(readFileSync(OUTPUT, 'utf8'))
    : {};

  for (const file of files) {
    const context = CONTEXT[file];
    if (!context) {
      console.log(`  skipped  ${file} — no context entry`);
      continue;
    }

    if (results[file]) {
      console.log(`  ${file} … cached`);
      continue;
    }

    const bytes = await readFile(path.join(ASSET_DIR, file));
    process.stdout.write(`  ${file} … `);

    try {
      // The Flash models return 503 under load often enough that a single
      // attempt loses files at random.
      let analysis;
      for (let attempt = 1; ; attempt++) {
        try {
          analysis = await provider.analyze({
            bytes: new Uint8Array(bytes),
            mimeType: MIME[path.extname(file).toLowerCase()],
            fileName: file,
            title: context.title,
          });
          break;
        } catch (error) {
          const overloaded = String(error).includes('503') || String(error).includes('UNAVAILABLE');
          if (!overloaded || attempt >= 5) throw error;
          process.stdout.write(`busy, retry ${attempt} … `);
          await new Promise((r) => setTimeout(r, attempt * 4000));
        }
      }

      results[file] = analysis;
      console.log('ok');
      console.log(`      community  ${analysis.suggestedCommunity ?? '—'}`);
      console.log(`      period     ${analysis.suggestedPeriod ?? '—'}`);
      console.log(`      origin     ${analysis.suggestedOrigin ?? '—'}`);
      console.log(`      confidence ${Math.round(analysis.confidence * 100)}%`);
      console.log(`      summary    ${analysis.summary}`);
      if (analysis.reasoning) console.log(`      because    ${analysis.reasoning}`);
      console.log();
    } catch (error) {
      console.log('FAILED');
      console.error('     ', error instanceof Error ? error.message : error);
    }
  }

  await writeFile(OUTPUT, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Wrote ${Object.keys(results).length} analyses to ${path.relative(process.cwd(), OUTPUT)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
