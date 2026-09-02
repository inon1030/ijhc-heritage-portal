/**
 * Does the model actually catalogue from the archive's own list?
 *
 * One real analysis against a real file, printing what came back. It exists
 * because the change it checks is a prompt-and-schema change, and the only
 * honest test of one of those is a live call: a passing unit test proves the
 * list was assembled, not that the model used it.
 *
 *   npx tsx scripts/probe-vocabulary.ts scripts/seed-assets/ketuba.jpg
 */
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { buildVocabulary, byBranch } from '../src/lib/vocabulary/thesaurus';
import { createGeminiProvider } from '../src/lib/ai/gemini';
import { resolveMimeType } from '../src/lib/files/detect';
import type { Keyword } from '../src/lib/types';

config({ path: '.env.local' });

async function main() {

const path = process.argv[2] ?? 'scripts/seed-assets/ketuba.jpg';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const { data, error } = await db.from('keywords').select('*');
if (error) throw error;

const vocabulary = byBranch(buildVocabulary((data ?? []) as Keyword[]));
const allowed = new Set(
  vocabulary.flatMap((b) => b.terms.flatMap((t) => [t.term.toLowerCase(), ...t.variants.map((v) => v.toLowerCase())])),
);

console.log(`vocabulary: ${allowed.size} spellings across ${vocabulary.length} branches\n`);

/*
 * `--dry` stops at the API boundary and prints what would be sent.
 *
 * Worth having on its own: the live call depends on Google being available —
 * it returned 503 UNAVAILABLE for several minutes while this was written — and
 * everything this project controls can be checked without it.
 */
if (process.argv.includes('--dry')) {
  const { buildInstructions } = await import('../src/lib/ai/prompt');
  const instructions = buildInstructions(vocabulary);
  const section = instructions.slice(instructions.indexOf('── Subject terms ──'));

  console.log(section.split(String.fromCharCode(10)).slice(0, 80).join(String.fromCharCode(10)));
  console.log(`\nenum offered to the model: ${allowed.size} spellings`);
  console.log(`instructions: ${instructions.length} characters`);
  return;
}

const bytes = new Uint8Array(readFileSync(path));
const mimeType = resolveMimeType(bytes, 'application/octet-stream');

const result = await createGeminiProvider().analyze({
  bytes,
  mimeType,
  fileName: path.split(/[\\/]/).pop()!,
  title: '',
  vocabulary,
});

console.log(`file      : ${path}  (${mimeType})`);
console.log(`summary   : ${result.summary?.slice(0, 110)}…\n`);

console.log('keywords returned:');
for (const term of result.keywords) {
  const known = allowed.has(term.toLowerCase());
  console.log(`  ${known ? 'IN LIST ' : 'OFF-LIST'}  ${term}`);
}

console.log('\nnew terms proposed:');
if (!result.newTerms.length) console.log('  (none)');
for (const proposal of result.newTerms) {
  console.log(`  ${proposal.term}  →  ${proposal.branchKey}`);
}

const offList = result.keywords.filter((t) => !allowed.has(t.toLowerCase()));
console.log(
  `\n${offList.length === 0 ? 'PASS' : 'FAIL'}: ${offList.length} of ${result.keywords.length} keywords came from outside the list.`,
);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
