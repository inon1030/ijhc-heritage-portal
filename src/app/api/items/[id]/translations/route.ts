import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, invalid, ok, readJson, unexpected } from '@/lib/api';
import { createServerSupabase, getCurrentVolunteer } from '@/lib/supabase/server';
import { listLanguages } from '@/lib/translate/languages';
import { translateRecord } from '@/lib/translate';
import { sourceHash, TRANSLATABLE_FIELDS } from '@/lib/translate/plan';

/**
 * Every language of one record, for the volunteer who is about to publish it.
 *
 * The archive publishes in five languages, and until this existed a volunteer
 * approved a record having seen exactly one of them. The translations were made
 * afterwards, by a machine, and went straight to readers — so the one screen in
 * the whole system whose entire job is "a person looked at this before it went
 * out" was the one screen that could not see four fifths of what went out.
 *
 * ── what it does ────────────────────────────────────────────────────────────
 *
 * `GET`  — the source text and every stored translation, each field marked
 *          current, stale or missing.
 * `POST` — make what is missing, now, so the volunteer has something to read.
 * `PUT`  — save a correction. Stored as `source: 'human'`, which the translator
 *          never overwrites (decision 15): a volunteer's word outlives the
 *          machine's, including after the record is edited underneath it.
 *
 * ── volunteer-only, three times over ────────────────────────────────────────
 *
 * Checked here for a clear 401; enforced by `item_translations_volunteer_write`
 * on the writes; and the reads run as the caller, so RLS decides. It matters
 * more than usual because a record in the queue is unpublished family material.
 */

export const maxDuration = 60;

/** Long enough to make a few languages, short enough to answer. */
const BUDGET_MS = 45_000;

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await getCurrentVolunteer())) {
      return fail(401, 'unauthenticated', 'Sign in as an approved volunteer.');
    }
    const { id } = await context.params;
    return ok(await collect(id));
  } catch (error) {
    return unexpected(error);
  }
}

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await getCurrentVolunteer())) {
      return fail(401, 'unauthenticated', 'Sign in as an approved volunteer.');
    }
    const { id } = await context.params;

    // Bounded, and the bound is handed down to the model call itself — the same
    // shape as the nightly sweep, for the same reason: a serverless function is
    // killed at its limit with nothing reported, and a volunteer watching a
    // spinner cannot tell that from a slow model.
    const sweep = await translateRecord(id, { deadline: Date.now() + BUDGET_MS });
    const state = await collect(id);
    return ok({ ...state, made: sweep.made, quota: sweep.quota });
  } catch (error) {
    return unexpected(error);
  }
}

const Correction = z.object({
  lang: z.string().min(2).max(12),
  field: z.enum(TRANSLATABLE_FIELDS as unknown as [string, ...string[]]),
  value: z.string().trim().max(8000),
});

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await getCurrentVolunteer())) {
      return fail(401, 'unauthenticated', 'Sign in as an approved volunteer.');
    }
    const { id } = await context.params;
    const parsed = Correction.safeParse(await readJson(request));
    if (!parsed.success) return invalid(parsed.error);

    const { lang, field, value } = parsed.data;
    const supabase = await createServerSupabase();

    // The record as it stands, so the correction is stamped with the hash of
    // the text it was made from. Without that the sweep would call the
    // volunteer's line stale the moment anything else on the record changed.
    const { data: item, error: itemError } = await supabase
      .from('items')
      .select('id, title, description, provenance, period, origin_place')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item) return fail(404, 'not_found', 'No such record.');

    const source = ((item as Record<string, unknown>)[field] ?? '').toString().trim();

    // An emptied box means "the machine's line was wrong and I have nothing
    // better": the row goes, the reader sees the original, and the sweep is
    // free to try again. That is not the same as saving a blank.
    if (!value) {
      const { error } = await supabase
        .from('item_translations')
        .delete()
        .eq('item_id', id)
        .eq('lang', lang)
        .eq('field', field);
      if (error) throw error;
      return ok(await collect(id));
    }

    const { error } = await supabase.from('item_translations').upsert(
      {
        item_id: id,
        lang,
        field,
        value,
        source: 'human',
        model: null,
        source_hash: sourceHash(source),
      },
      { onConflict: 'item_id,lang,field' },
    );
    if (error) throw error;

    return ok(await collect(id));
  } catch (error) {
    return unexpected(error);
  }
}

export interface FieldState {
  field: string;
  source: string;
  value: string | null;
  /** 'human', 'machine', or null when there is nothing stored. */
  by: string | null;
  /** True when the stored line was made from text that has since changed. */
  stale: boolean;
}

/**
 * The record in every language, field by field, with the truth about each one.
 *
 * "Missing" and "stale" are different problems and the screen must show them
 * differently: missing is work not done; stale is a line that reads as finished
 * while describing text nobody wrote any more. Stale is the dangerous one,
 * which is why it is computed from the same `source_hash` the nightly sweep
 * uses rather than guessed from a timestamp.
 */
async function collect(itemId: string) {
  const supabase = await createServerSupabase();

  const [{ data: item, error }, languages] = await Promise.all([
    supabase
      .from('items')
      .select('id, title, description, provenance, period, origin_place, language')
      .eq('id', itemId)
      .is('deleted_at', null)
      .maybeSingle(),
    listLanguages(),
  ]);
  if (error) throw error;
  if (!item) return { languages: [], fields: [], byLanguage: {}, itemLanguage: null };

  const { data: rows } = await supabase
    .from('item_translations')
    .select('lang, field, value, source, source_hash')
    .eq('item_id', itemId);

  // The transcript is deliberately not offered here. It lives in `ai_analyses`,
  // it is often very long, and correcting a transcription is a different job
  // from checking that a catalogue entry reads properly.
  const fields = TRANSLATABLE_FIELDS.filter((f) => f !== 'transcript').filter((f) =>
    ((item as Record<string, unknown>)[f] ?? '').toString().trim(),
  );

  const stored = rows ?? [];
  const byLanguage: Record<string, FieldState[]> = {};

  for (const language of languages) {
    if (language.is_source) continue;
    byLanguage[language.code] = fields.map((field) => {
      const source = ((item as Record<string, unknown>)[field] ?? '').toString().trim();
      const row = stored.find((r) => r.lang === language.code && r.field === field);
      return {
        field,
        source,
        value: (row?.value as string | undefined) ?? null,
        by: (row?.source as string | undefined) ?? null,
        stale: Boolean(row) && row?.source_hash !== sourceHash(source),
      };
    });
  }

  return {
    languages: languages.filter((l) => !l.is_source),
    fields,
    byLanguage,
    itemLanguage: item.language ?? null,
  };
}
