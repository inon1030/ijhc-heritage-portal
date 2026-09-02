/**
 * Seeds the archive with the material carried over from the pilot demo.
 *
 * Every image here is a real file a contributor uploaded to the demo, and every
 * `ai_analyses` row is genuine output from Gemini — produced by
 * scripts/analyze-assets.ts and cached in scripts/seed-analysis.json. Nothing
 * in this file is invented AI text.
 *
 * What is published, and what waits in the queue, was decided the way the
 * product intends: a person read each analysis and judged it.
 *
 *   npx tsx scripts/analyze-assets.ts   (once, costs API calls)
 *   npm run db:seed
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { resolveMimeType } from '../src/lib/files/detect';
import { readImageDimensions } from '../src/lib/files/dimensions';
import { config } from 'dotenv';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey || url.includes('placeholder')) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ASSET_DIR = path.join(process.cwd(), 'scripts', 'seed-assets');
const ANALYSIS_FILE = path.join(process.cwd(), 'scripts', 'seed-analysis.json');
const SEED_PREFIX = 'uploads/seed/';

/**
 * A last resort only. The type is read from the bytes; this map is consulted
 * when the bytes match nothing we recognise. One of the demo files is named
 * `kachori.jpeg` and is a WebP, which is why the extension does not get to
 * decide.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

interface Analysis {
  provider: string;
  model: string;
  summary: string;
  keywords: string[];
  language: string | null;
  confidence: number;
  ocrText: string | null;
  transcript: string | null;
  suggestedCommunity: string | null;
  suggestedPeriod: string | null;
  suggestedOrigin: string | null;
  reasoning: string | null;
  raw: unknown;
}

type Community = 'bene_israel' | 'cochin' | 'baghdadi' | 'bnei_menashe';

interface Seed {
  asset: string;
  /** The title as it should read once catalogued. */
  title: string;
  category: 'material_culture' | 'documents' | 'oral_histories';
  /** The contributor line as it was entered in the demo. Not invented. */
  source: string | null;
  status: 'accepted' | 'pending';
  /**
   * Present only where a person read the analysis and accepted it. Everything
   * else stays null and goes to the review queue, which is the honest state for
   * material nobody has verified yet.
   */
  verified?: {
    description: string;
    community: Community | null;
    period: string | null;
    originPlace: string | null;
    language: string | null;
    keywords: string[];
  };
}

/**
 * Provenance is deliberately identical and deliberately vague on every record.
 * These files came across from a proof-of-concept where nobody recorded where
 * they originated. Writing a plausible provenance would be exactly the kind of
 * fabrication this archive exists to prevent.
 */
const PROVENANCE_UNKNOWN =
  'Carried over from the pilot demo. Chain of ownership not yet established — needs confirmation with the contributor.';

const SEEDS: Seed[] = [
  // ── Published: a person read the analysis and accepted it ─────────────────
  {
    asset: 'synagogue-exterior.webp',
    title: 'Keneseth Eliyahoo Synagogue, Fort, Mumbai',
    category: 'material_culture',
    source: 'Guy collection',
    status: 'accepted',
    verified: {
      description:
        'The Keneseth Eliyahoo Synagogue in Fort, Mumbai, built in 1884 by the Sassoon family. Three storeys in Victorian classical revival style, with its distinctive blue and white painted facade, arched windows and triangular pediment.',
      community: 'baghdadi',
      period: 'Built 1884; photograph modern',
      originPlace: 'Mumbai, India',
      language: null,
      keywords: ['Synagogue', 'Architecture', 'Mumbai', 'Sassoon', 'Victorian revival'],
    },
  },
  {
    asset: 'ezra-clipping.jpeg',
    title: 'Rosh Hashanah greeting from Sir David Ezra, Calcutta',
    category: 'documents',
    source: 'ken collection',
    status: 'accepted',
    verified: {
      description:
        'A newspaper greeting for Rosh Hashanah signed by Sir David Ezra of Calcutta, with a portrait photograph. The message wishes peace and health to all while acknowledging the distress of fellow Jews in distant lands.',
      community: 'baghdadi',
      period: '1930s',
      originPlace: 'Calcutta, India',
      language: 'English',
      keywords: ['Sir David Ezra', 'Rosh Hashanah', 'Calcutta', 'Newspaper', 'Community leadership'],
    },
  },
  {
    asset: 'lady-ezra-group.png',
    title: 'Lady Rachel Ezra with a women’s committee, Calcutta',
    category: 'material_culture',
    source: 'ken collection',
    status: 'accepted',
    verified: {
      description:
        'Lady Rachel Ezra seated at a table bearing a Hanukkah menorah, with members of a Jewish women’s committee and girls in uniforms marked with the Star of David. Lady Ezra led WIZO and other communal organisations in Calcutta.',
      community: 'baghdadi',
      period: '1930s–1940s',
      originPlace: 'Calcutta, India',
      language: null,
      keywords: ['Lady Rachel Ezra', 'WIZO', 'Calcutta', 'Hanukkah', 'Women'],
    },
  },
  {
    asset: 'baghdadi-religious-book.jpeg',
    title: 'The Order of Supplication and Confession, Baghdadi rite, Bombay 1907',
    category: 'documents',
    source: 'kr',
    status: 'accepted',
    verified: {
      description:
        'Title page of a prayer book of supplications and confession prayers according to the custom of the Jewish community of Baghdad, with an English translation. Printed and published in 1907 by J. D. Ashkenazy & Co. at the Lebanon Printing Press, Bake House Lane, Fort, Bombay.',
      community: 'baghdadi',
      period: '1907',
      originPlace: 'Bombay, India',
      language: 'Hebrew and English',
      keywords: ['Liturgy', 'Baghdadi rite', 'Printing', 'Bombay', 'Selichot'],
    },
  },
  {
    asset: 'ketuba-detail.jpg',
    title: 'Illuminated Megillat Esther with Marathi headings',
    category: 'documents',
    source: 'The Benjamin Family',
    status: 'accepted',
    verified: {
      // The demo filed this as "A part of a Ketuba". It is not a ketubah, and
      // the correction is exactly what a review step is for.
      description:
        'An illuminated page of the Book of Esther, with the Hebrew scroll text alongside headings in Marathi in Devanagari script. The miniature shows Queen Esther before King Ahasuerus enthroned in an Indian courtly setting. Catalogued in the pilot demo as part of a ketubah; it is a Megillat Esther.',
      community: 'bene_israel',
      period: 'Late 19th century',
      originPlace: 'Maharashtra, India',
      language: 'Hebrew and Marathi',
      keywords: ['Megillat Esther', 'Illumination', 'Marathi', 'Devanagari', 'Purim'],
    },
  },
  {
    asset: 'jewish-family-group.jpg',
    title: 'Indian Jewish family portrait',
    category: 'material_culture',
    source: 'The Sassoon Collection',
    status: 'accepted',
    verified: {
      description:
        'A studio portrait of an extended family across three generations. The men and boys wear patterned skullcaps and layered robes; the dress and the photographic conventions place it in the late nineteenth century.',
      community: 'cochin',
      period: 'Late 19th century',
      originPlace: 'Cochin, India',
      language: null,
      keywords: ['Portrait', 'Family', 'Dress', 'Studio photography', 'Cochin'],
    },
  },

  // ── Queued: real submissions awaiting a reviewer ──────────────────────────
  {
    asset: 'ketuba.jpg',
    title: 'Ketuba',
    category: 'documents',
    source: 'Avigdor Sharon',
    status: 'pending',
  },
  {
    asset: 'asf-bollywood-poster.jpeg',
    title: 'bollywood',
    category: 'material_culture',
    source: 'ken',
    status: 'pending',
  },
  {
    asset: 'kachori.jpeg',
    title: 'Kachori (Spiced Pea Dumpling)',
    category: 'material_culture',
    source: null,
    status: 'pending',
  },
];

async function main() {
  if (!existsSync(ANALYSIS_FILE)) {
    console.error('No scripts/seed-analysis.json. Run: npx tsx scripts/analyze-assets.ts');
    process.exit(1);
  }

  const analyses = JSON.parse(readFileSync(ANALYSIS_FILE, 'utf8')) as Record<string, Analysis>;

  // Clear only what a previous seed created, so a hand-uploaded test item survives.
  const { data: old } = await supabase
    .from('item_files')
    .select('item_id, storage_path')
    .like('storage_path', `${SEED_PREFIX}%`);

  if (old?.length) {
    await supabase.from('items').delete().in('id', old.map((f) => f.item_id));
    await supabase.storage.from('heritage').remove(old.map((f) => f.storage_path));
    console.log(`Cleared ${old.length} previously seeded records.\n`);
  }

  let published = 0;
  let queued = 0;

  for (const seed of SEEDS) {
    const assetPath = path.join(ASSET_DIR, seed.asset);
    if (!existsSync(assetPath)) {
      console.error(`  missing asset: ${seed.asset}`);
      continue;
    }

    const bytes = await readFile(assetPath);
    const claimed = MIME_BY_EXTENSION[path.extname(seed.asset).toLowerCase()] ?? 'application/octet-stream';
    const mimeType = resolveMimeType(new Uint8Array(bytes), claimed);
    if (mimeType !== claimed) {
      console.log(`  ${seed.asset} is ${mimeType}, not ${claimed} — going with the bytes.`);
    }
    const storagePath = `${SEED_PREFIX}${seed.asset}`;

    const { error: uploadError } = await supabase.storage
      .from('heritage')
      .upload(storagePath, bytes, { contentType: mimeType, upsert: true });

    if (uploadError) {
      console.error(`  ${seed.title}: upload failed — ${uploadError.message}`);
      continue;
    }

    const { data: item, error: itemError } = await supabase
      .from('items')
      .insert({
        title: seed.title,
        description: seed.verified?.description ?? null,
        category: seed.category,
        community: seed.verified?.community ?? null,
        provenance: PROVENANCE_UNKNOWN,
        source: seed.source,
        keywords: seed.verified?.keywords ?? [],
        language: seed.verified?.language ?? null,
        period: seed.verified?.period ?? null,
        origin_place: seed.verified?.originPlace ?? null,
        status: seed.status,
        access: 'public',
        reviewed_at: seed.status === 'accepted' ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (itemError) {
      console.error(`  ${seed.title}: insert failed — ${itemError.message}`);
      continue;
    }

    // Measured from the bytes, the same way an uploaded file is. Leaving these
    // null made every seeded record read "Dimensions: not measured", which is
    // honest but needlessly so — the bytes are right here.
    const dimensions = readImageDimensions(new Uint8Array(bytes), mimeType);

    await supabase.from('item_files').insert({
      item_id: item.id,
      storage_path: storagePath,
      file_name: seed.asset,
      mime_type: mimeType,
      byte_size: bytes.length,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      checksum: createHash('sha256').update(bytes).digest('hex'),
      is_primary: true,
    });

    // Real Gemini output, exactly as returned. Suggestions, not record content.
    const analysis = analyses[seed.asset];
    if (analysis) {
      await supabase.from('ai_analyses').insert({
        item_id: item.id,
        provider: analysis.provider,
        model: analysis.model,
        status: 'succeeded',
        summary: analysis.summary,
        keywords: analysis.keywords,
        language: analysis.language,
        confidence: analysis.confidence,
        ocr_text: analysis.ocrText,
        transcript: analysis.transcript,
        suggested_community: analysis.suggestedCommunity,
        suggested_period: analysis.suggestedPeriod,
        suggested_origin: analysis.suggestedOrigin,
        reasoning: analysis.reasoning,
        raw: analysis.raw,
      });
    }

    await supabase.from('item_events').insert({
      item_id: item.id,
      action: 'submitted',
      to_status: seed.status,
    });

    if (seed.status === 'accepted') published += 1;
    else queued += 1;

    console.log(`  ${seed.status === 'accepted' ? 'published' : 'queued   '}  ${seed.title}`);
  }

  console.log(`\n${published} published, ${queued} awaiting review.`);
  console.log('Every image is a real upload from the pilot demo; every AI analysis is real Gemini output.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
