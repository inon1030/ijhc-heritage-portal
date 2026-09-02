import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import type { AnalysisResult } from '@/lib/ai';
import { fieldDef, isValidValue } from '@/lib/fields/registry';
import { mergeSuggestions } from '@/lib/fields/suggestions';
import { registerContributor } from '@/lib/contributors';
import { recordCandidates } from '@/lib/vocabulary/mutations';
import { canTransition } from './status';
import type { AccessLevel, Community, Item, ItemCategory, ItemStatus } from '@/lib/types';

export interface CreateFileInput {
  storagePath: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** Where the viewable derivative was stored, for masters browsers cannot show. */
  previewPath: string | null;
  /** What the model said about this file. One analysis per file. */
  analysis: AnalysisResult | null;
  analysisError: string | null;
}

export interface CreateItemInput {
  title: string;
  source: string | null;
  /** Set only by link ingestion. A contributor never types this. */
  sourceUrl: string | null;
  /** Unverified, grants nothing. Lets a volunteer come back with a question. */
  contributorEmail: string | null;
  /**
   * The version of the handling notice on screen when they agreed. Stamped on
   * the record, because the question years later is what *this* contributor was
   * told, not what the site says today.
   */
  consentVersion: string;
  /**
   * Asked for at upload so that the surname can help place the material. A
   * claim a stranger typed, not a verified identity, and optional like the
   * address.
   */
  contributorFullName: string | null;
  /** The contributor's own words, kept apart from what a reviewer approves. */
  contributorDescription: string | null;
  contributorKeywords: string[];
  /**
   * The row-held tree fields as the contributor left the pre-review: the
   * machine's suggestions they kept, the ones they corrected, and any they
   * added from the picklist. Null when the screen never showed them, which is
   * not the same as an empty list — an empty list means they cleared every one.
   */
  contributorFields: { key: string; value: string }[] | null;
  /** At least one. The first is the primary — the cover of the record. */
  files: CreateFileInput[];
}

/**
 * Creates a submission.
 *
 * Runs with the service-role client because anonymous contribution is a product
 * requirement while the anon database role stays read-only. That makes this
 * function the enforcement point, so it does two things unconditionally:
 * status is 'pending', and AI output is written to ai_analyses, never to items.
 *
 * The contributor's own description and tags are a third thing again — their
 * words, in their own columns, for a reviewer to weigh. Accepting the machine's
 * text unchanged in the upload screen does not make it the record.
 */
export async function createItem(input: CreateItemInput): Promise<Item> {
  const admin = createAdminSupabase();

  if (!input.files.length) throw new Error('A submission needs at least one file.');

  /*
   * Who this is from, before the record exists.
   *
   * One row per person in `contributors`, so four submissions from one address
   * are four submissions from one person rather than four unrelated rows — and
   * so that the families a volunteer ties to that address are known the next
   * time they send something. The name is what they typed; it is a claim, and
   * it only ever fills a blank.
   */
  const contributor = input.contributorEmail
    ? await registerContributor(input.contributorEmail, input.contributorFullName)
    : null;

  const { data: item, error: itemError } = await admin
    .from('items')
    .insert({
      title: input.title,
      // Deliberately not set: the reviewer catalogues it, with the model's
      // suggestion one click away in the workbench.
      source: input.source,
      source_url: input.sourceUrl,
      contributor_id: contributor?.id ?? null,
      consent_version: input.consentVersion,
      consent_at: new Date().toISOString(),
      contributor_description: input.contributorDescription,
      contributor_keywords: input.contributorKeywords,
      status: 'pending',
      access: 'public',
    })
    .select()
    .single();

  if (itemError) throw itemError;

  const { data: files, error: fileError } = await admin
    .from('item_files')
    .insert(
      input.files.map((file, index) => ({
        item_id: item.id,
        storage_path: file.storagePath,
        file_name: file.fileName,
        mime_type: file.mimeType,
        byte_size: file.byteSize,
        width: file.width,
        height: file.height,
        duration_ms: file.durationMs,
        preview_path: file.previewPath,
        position: index,
        is_primary: index === 0,
      })),
    )
    .select();

  if (fileError) {
    // Leave nothing half-created: a record with no file is unreviewable.
    await admin.from('items').delete().eq('id', item.id);
    throw fileError;
  }

  // One analysis row per file, tied to the file it looked at. Page four's OCR
  // belongs to page four.
  const byPath = new Map((files ?? []).map((f) => [(f as { storage_path: string }).storage_path, f]));

  const analyses = input.files.map((file) => {
    const row = byPath.get(file.storagePath) as { id: string } | undefined;
    return {
      item_id: item.id,
      file_id: row?.id ?? null,
      provider: file.analysis?.provider ?? 'none',
      model: file.analysis?.model ?? 'none',
      status: file.analysis ? 'succeeded' : 'failed',
      error: file.analysisError,
      summary: file.analysis?.summary ?? null,
      keywords: file.analysis?.keywords ?? [],
      language: file.analysis?.language ?? null,
      confidence: file.analysis?.confidence ?? null,
      ocr_text: file.analysis?.ocrText ?? null,
      transcript: file.analysis?.transcript ?? null,
      suggested_community: file.analysis?.suggestedCommunity ?? null,
      suggested_period: file.analysis?.suggestedPeriod ?? null,
      suggested_origin: file.analysis?.suggestedOrigin ?? null,
      reasoning: file.analysis?.reasoning ?? null,
      evidence: file.analysis?.evidence ?? null,
      off_topic: file.analysis?.offTopic ?? false,
      off_topic_reason: file.analysis?.offTopicReason ?? null,
      raw: file.analysis?.raw ?? null,
    };
  });

  const { error: analysisError } = await admin.from('ai_analyses').insert(analyses);

  // A failed analysis row is not worth losing the submission over.
  if (analysisError) console.error('[items] analysis insert failed', analysisError);

  await writeFields(item.id, input.files, input.contributorFields);

  // Terms the model reached for that the vocabulary does not hold yet. Queued
  // for a volunteer rather than dropped, which is what keeps a closed
  // vocabulary from slowly making the archive blind.
  const suggested = input.files.flatMap((f) => f.analysis?.keywords ?? []);
  await recordCandidates(
    [...suggested, ...input.contributorKeywords],
    input.files[0]?.analysis?.suggestedCommunity ?? null,
    item.id,
  );

  await admin.from('item_events').insert({
    item_id: item.id,
    actor_id: null,
    action: 'submitted',
    to_status: 'pending',
  });

  return item as Item;
}

/**
 * Writes the record's tree fields.
 *
 * The contributor's list is authoritative for *which* fields the record has.
 * They saw the machine's suggestions in the pre-review and could delete any of
 * them, and a deletion is a judgement — "the archive read this wrong" — so a
 * field they removed must not come back. Only when no list is supplied at all
 * (a submission made without the pre-review ever rendering) do the machine's
 * suggestions stand on their own.
 *
 * A value left exactly as the machine wrote it keeps its `ai` row, with the
 * basis and the clause intact. A value they changed becomes a `contributor`
 * row with no basis, because it now rests on the contributor and not on
 * anything in the file. This is the same rule the description already follows:
 * accepting machine text unchanged does not launder it into a person's words,
 * and rewriting it does not leave it looking machine-read.
 *
 * The six that own a column on `items` follow a stricter rule, and it is the
 * one that lets a contributor correct a finding without letting them file the
 * record. The machine's answer for those is never copied here — it already
 * lives in `ai_analyses`, and a second copy is two places to look with no rule
 * about which wins. A row is written **only when a person changed the value**,
 * and then it is theirs: a claim a volunteer can read and adopt, sitting beside
 * the machine's rather than on top of it. `items.community` is still null until
 * a reviewer sets it.
 */
async function writeFields(
  itemId: string,
  files: CreateFileInput[],
  contributorFields: { key: string; value: string }[] | null,
): Promise<void> {
  const admin = createAdminSupabase();

  // Everything the machine proposed, columns included — the columns are needed
  // here to recognise an unchanged value, even though they are never written
  // back as `ai` rows.
  const suggested = new Map(
    mergeSuggestions(files.map((f) => f.analysis?.fields ?? [])).map((s) => [s.key, s]),
  );

  const wanted =
    contributorFields === null
      ? [...suggested.values()].map((s) => ({ key: s.key, value: s.value }))
      : contributorFields;

  /*
   * Keyed, not appended.
   *
   * `item_fields` holds one row per field per record, and `contributorFields`
   * arrives from a browser with no uniqueness guarantee. A repeated key used to
   * violate the constraint and fail the single insert, which meant one
   * duplicate silently cost the record *every* catalogue field while the
   * submission still reported success. Last write wins, which matches how the
   * sheet behaves on screen.
   */
  const rows = new Map<string, Record<string, unknown>>();

  for (const { key, value } of wanted) {
    const def = fieldDef(key);
    const trimmed = value.trim();

    // The API validates too. This is the layer that must not be bypassed:
    // createItem is the only writer, so an unknown key stops being storable
    // here rather than at whichever screen happens to render it.
    if (!def || !isValidValue(key, trimmed)) continue;

    const machine = suggested.get(key);
    const untouched = machine?.value === trimmed;

    // A column-backed field is worth a row only as a correction. Unchanged, it
    // would duplicate ai_analyses; changed, it is something the contributor
    // knows and the model did not.
    if (def.column && untouched) continue;

    rows.set(key, {
      item_id: itemId,
      field_key: key,
      value: trimmed,
      source: untouched ? 'ai' : 'contributor',
      confidence: untouched ? machine!.confidence : null,
      basis: untouched ? machine!.basis : null,
      note: untouched ? machine!.note : null,
    });
  }

  if (!rows.size) return;

  const { error } = await admin.from('item_fields').insert([...rows.values()]);

  // Same reasoning as the analysis rows: the files and the record are safely
  // stored, and losing the whole submission over a catalogue field would be a
  // worse outcome than a reviewer filling it in by hand.
  if (error) console.error('[items] field insert failed', error);
}

export interface ReviewInput {
  itemId: string;
  status: ItemStatus;
  title: string;
  category: ItemCategory | null;
  description: string | null;
  community: Community | null;
  provenance: string | null;
  keywords: string[];
  language: string | null;
  period: string | null;
  originPlace: string | null;
  /**
   * Who the record is for — the Stakeholders branch of the tree, answered as a
   * question about the record rather than catalogued as a field. Only `public`
   * is readable by an anonymous visitor, which RLS has enforced since 0002.
   */
  access: AccessLevel;
  /**
   * The tree fields as the reviewer left them. This is the whole set, not a
   * change list: a field they cleared is a field they decided the record does
   * not have, and the only way to express that is by its absence.
   */
  fields: { key: string; value: string }[];
}

export type ReviewOutcome =
  | { ok: true; item: Item }
  | { ok: false; code: 'not_found' | 'forbidden' | 'invalid_transition'; message: string };

/**
 * Applies a reviewer's decision.
 *
 * Deliberately uses the caller's session client rather than the admin client,
 * so RLS gets the final say. If the policies are ever loosened by mistake, this
 * still fails closed for anyone without a profile row.
 */
export async function reviewItem(input: ReviewInput): Promise<ReviewOutcome> {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: 'forbidden', message: 'Sign in to review submissions.' };

  const { data: current, error: readError } = await supabase
    .from('items')
    .select('id, status')
    .eq('id', input.itemId)
    .maybeSingle();

  if (readError) throw readError;
  if (!current) return { ok: false, code: 'not_found', message: 'That submission no longer exists.' };

  const from = current.status as ItemStatus;
  if (from !== input.status && !canTransition(from, input.status)) {
    return {
      ok: false,
      code: 'invalid_transition',
      message: `A ${from} item cannot move straight to ${input.status}.`,
    };
  }

  /*
   * One statement, one transaction.
   *
   * This used to be an update, then a delete of the record's tree fields, then
   * an insert of the new ones — three round trips on a client with no
   * multi-statement transaction. An insert that failed after the delete had
   * succeeded left the record published with no catalogue fields, and the
   * status change already committed.
   *
   * `review_item` is `security invoker` on purpose. Running on the caller's
   * session rather than the service-role client is what keeps RLS as the final
   * word here, and a definer function would trade that away to fix a smaller
   * problem. A pending account calling it still fails items_volunteer_update
   * and gets a null row back.
   */
  const { data: updated, error: updateError } = await supabase
    .rpc('review_item', {
      p_item_id: input.itemId,
      p_status: input.status,
      p_title: input.title,
      p_category: input.category,
      p_description: input.description,
      p_community: input.community,
      p_provenance: input.provenance,
      p_keywords: input.keywords,
      p_language: input.language,
      p_period: input.period,
      p_origin_place: input.originPlace,
      p_access: input.access,
      p_fields: input.fields
        .map(({ key, value }) => ({ key, value: value.trim() }))
        .filter(({ key, value }) => fieldDef(key) && !fieldDef(key)?.column && isValidValue(key, value)),
    })
    .maybeSingle();

  if (updateError) throw updateError;
  if (!updated) {
    return { ok: false, code: 'forbidden', message: 'That record could not be saved. Sign in as an approved volunteer.' };
  }

  await supabase.from('item_events').insert({
    item_id: input.itemId,
    actor_id: user.id,
    action: from === input.status ? 'edited' : 'status_changed',
    from_status: from,
    to_status: input.status,
    changes: {
      title: input.title,
      community: input.community,
      language: input.language,
      keywords: input.keywords,
      // Recorded because withholding a record from the public is a decision
      // somebody may have to account for later.
      access: input.access,
    },
  });

  return { ok: true, item: updated as Item };
}

/**
 * Sends a record to the bin. A volunteer's act, and reversible.
 *
 * This used to be `delete()`. It removed the row, cascaded to the catalogue
 * fields and the analyses, and then emptied the scan out of the bucket — one
 * volunteer, one click, gone. The record now keeps its status and its access
 * level and simply stops being visible anywhere, which is what makes restoring
 * it put back the review decision instead of starting it again.
 *
 * The files are left exactly where they are. Deleting the bytes here would
 * make the bin a promise the storage could not keep.
 */
export async function binItem(itemId: string, actorId: string, reason: string | null): Promise<boolean> {
  const supabase = await createServerSupabase();

  const { error, count } = await supabase
    .from('items')
    .update(
      {
        deleted_at: new Date().toISOString(),
        deleted_by: actorId,
        deleted_reason: reason?.trim() || null,
      },
      { count: 'exact' },
    )
    .eq('id', itemId)
    .is('deleted_at', null);

  if (error) throw error;
  return Boolean(count);
}

/**
 * Takes a record back out of the bin. An administrator's act.
 *
 * Enforced by `items_admin_bin_update`, which a volunteer fails on the USING
 * clause: their update policy only sees rows that are not binned, so the row
 * they would need to act on is invisible to them the moment it is binned.
 */
export async function restoreItem(itemId: string): Promise<boolean> {
  const supabase = await createServerSupabase();

  const { error, count } = await supabase
    .from('items')
    .update({ deleted_at: null, deleted_by: null, deleted_reason: null }, { count: 'exact' })
    .eq('id', itemId)
    .not('deleted_at', 'is', null);

  if (error) throw error;
  return Boolean(count);
}

/**
 * Destroys a record and its files for good. An administrator, and only from
 * the bin — `items_admin_delete` requires `deleted_at is not null`, so there is
 * no path from a live record to a destroyed one in one statement.
 */
export async function purgeItem(itemId: string): Promise<boolean> {
  const supabase = await createServerSupabase();

  // Both the master and its derivative. Selecting only `storage_path` left
  // every TIFF rendition in the bucket forever after its record was deleted.
  const { data: files } = await supabase
    .from('item_files')
    .select('storage_path, preview_path')
    .eq('item_id', itemId);

  const { error, count } = await supabase
    .from('items')
    .delete({ count: 'exact' })
    .eq('id', itemId)
    .not('deleted_at', 'is', null);

  if (error) throw error;
  if (!count) return false;

  const paths = (files ?? []).flatMap((f) => {
    const row = f as { storage_path: string; preview_path: string | null };
    return [row.storage_path, row.preview_path].filter((p): p is string => Boolean(p));
  });
  if (paths.length) {
    // Orphaned objects would otherwise sit in the bucket forever.
    await createAdminSupabase().storage.from('heritage').remove(paths);
  }

  return true;
}
