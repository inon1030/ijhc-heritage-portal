import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import { fieldDef } from '@/lib/fields/registry';
import type { Community, UserRole } from '@/lib/types';

/**
 * Writes for the vocabulary, the family register, and the account roll.
 *
 * These run through the *session* client, not the service role, so RLS is doing
 * the enforcement rather than trusting this file. The route handler checks the
 * role too, and so does the render — three places, as the project rules require.
 * The service-role client appears once, to delete an auth user, which is the
 * only operation the anon-key client cannot perform at all.
 */

export async function addKeyword(
  term: string,
  community: Community | null,
  branchKey: string | null = null,
) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('keywords')
    .insert({ term: term.trim(), community, branch_key: branchKey })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Hangs a term on a branch of the tree, or moves it to another one. */
export async function placeKeyword(id: string, branchKey: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('keywords').update({ branch_key: branchKey }).eq('id', id);
  if (error) throw error;
}

/**
 * Makes one term a spelling of another, or gives a variant its independence
 * back when `intoId` is null.
 *
 * The operation the whole thesaurus exists for. Nothing is destroyed: both
 * spellings remain, both find the same records, and only the preferred one is
 * written from here on. Records already carrying the old spelling are moved
 * over, because a merge that leaves half the collection under the abandoned
 * word has not merged anything.
 *
 * The database trigger from 0021 refuses a chain — a variant of a variant —
 * and refuses to demote a term that already has variants of its own. Both are
 * left to the trigger rather than checked here: it is the only place that sees
 * every writer.
 */
export async function mergeKeyword(id: string, intoId: string | null) {
  const supabase = await createServerSupabase();

  if (intoId) {
    const { data: pair, error: readError } = await supabase
      .from('keywords')
      .select('id, term')
      .in('id', [id, intoId]);

    if (readError) throw readError;

    const from = (pair ?? []).find((k) => (k as { id: string }).id === id) as
      | { term: string }
      | undefined;
    const into = (pair ?? []).find((k) => (k as { id: string }).id === intoId) as
      | { term: string }
      | undefined;

    if (!from || !into) throw new Error('One of those terms no longer exists.');

    const { error } = await supabase.from('keywords').update({ preferred_id: intoId }).eq('id', id);
    if (error) throw error;

    // Records move to the preferred spelling. Done after the link so that a
    // failure here leaves the vocabulary correct and the records catchable,
    // rather than records pointing at a term that never became one.
    const { data: affected } = await supabase
      .from('items')
      .select('id, keywords')
      .contains('keywords', [from.term]);

    for (const row of (affected ?? []) as { id: string; keywords: string[] }[]) {
      const moved = [...new Set(row.keywords.map((k) => (k === from.term ? into.term : k)))];
      await supabase.from('items').update({ keywords: moved }).eq('id', row.id);
    }

    return;
  }

  const { error } = await supabase.from('keywords').update({ preferred_id: null }).eq('id', id);
  if (error) throw error;
}

export async function deleteKeyword(id: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('keywords').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Promote a term the model suggested into the vocabulary proper.
 *
 * Both halves matter: the candidate is marked accepted so it stops appearing in
 * the queue, and the term becomes real. A conflict on insert is not a failure —
 * it means someone typed the same word by hand first.
 */
export async function acceptCandidate(id: string) {
  const supabase = await createServerSupabase();

  const { data: candidate, error: readError } = await supabase
    .from('keyword_candidates')
    .select('*')
    .eq('id', id)
    .single();

  if (readError) throw readError;

  const { error: insertError } = await supabase
    .from('keywords')
    // The branch travels with the term. A candidate that arrived as a
    // subdivision of "Cities and Villages" becomes a term under it — promoting
    // it into a flat list is what the queue was there to prevent.
    .insert({
      term: candidate.term,
      community: candidate.community,
      branch_key: candidate.branch_key,
    });

  // 23505 is unique_violation: the term already exists, which is the outcome
  // we wanted anyway.
  if (insertError && insertError.code !== '23505') throw insertError;

  const { error } = await supabase
    .from('keyword_candidates')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function declineCandidate(id: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('keyword_candidates')
    .update({ status: 'declined', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

/**
 * Record every term the model proposed that the vocabulary does not hold.
 *
 * Called after an analysis. A closed vocabulary keeps cataloguing consistent;
 * this is what stops it also making the archive blind to whatever nobody has
 * thought of yet. Runs with the service role because the contributor who caused
 * the analysis is usually anonymous.
 *
 * ── Two rules, both learned from what the queue actually filled up with ─────
 *
 * **A proposal names the branch it subdivides.** Eight analysed files produced
 * thirty-six loose candidates, among them a bare year, four words describing
 * the archiving process, and three community names that duplicate the enum.
 * A term that cannot say which branch of the tree it belongs under is not a
 * subject term, and the model is now required to supply one — so this takes
 * `{ term, branchKey }` rather than a string, and drops anything unplaced.
 *
 * **Nothing is queued from material the model says is not ours.** Five terms
 * in that queue — Cusco, Peru, Plaza de Armas, Andean costume, Cusco flag —
 * came from a holiday photograph. The `off_topic` flag existed and was not
 * consulted here.
 *
 * Never throws into the caller's path: losing a candidate is a small loss, and
 * losing the submission that produced it is not.
 */
export interface TermProposal {
  term: string;
  /** A branch key from the logical tree. A proposal without one is discarded. */
  branchKey: string;
}

export async function recordCandidates(
  proposals: TermProposal[],
  community: Community | null,
  itemId: string | null,
  options: { offTopic?: boolean } = {},
): Promise<void> {
  if (!proposals.length || options.offTopic) return;

  try {
    const admin = createAdminSupabase();

    const { data: existing } = await admin.from('keywords').select('term');
    const known = new Set(
      (existing ?? []).map((k) => (k as { term: string }).term.trim().toLowerCase()),
    );

    // Last writer wins per term, so one file proposing the same word under two
    // branches queues once rather than twice.
    const fresh = new Map<string, TermProposal>();
    for (const proposal of proposals) {
      const term = proposal.term?.trim();
      const branchKey = proposal.branchKey?.trim();
      if (!term || !branchKey) continue;
      if (term.length < 2 || term.length > 60) continue;
      if (known.has(term.toLowerCase())) continue;
      if (!fieldDef(branchKey)) continue;
      fresh.set(term.toLowerCase(), { term, branchKey });
    }

    for (const { term, branchKey } of fresh.values()) {
      // Upsert by hand: the unique index is on lower(btrim(term)) and Postgres
      // cannot infer a conflict target from an expression index through PostgREST.
      const { data: seen } = await admin
        .from('keyword_candidates')
        .select('id, seen_count')
        .ilike('term', term)
        .maybeSingle();

      if (seen) {
        await admin
          .from('keyword_candidates')
          .update({ seen_count: seen.seen_count + 1, updated_at: new Date().toISOString() })
          .eq('id', seen.id);
      } else {
        await admin
          .from('keyword_candidates')
          .insert({ term, community, branch_key: branchKey, first_item_id: itemId });
      }
    }
  } catch (error) {
    console.error('[vocabulary] could not record candidates', error);
  }
}

export async function addFamily(name: string, community: Community, notes: string | null) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('families')
    .insert({ name: name.trim(), community, notes })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteFamily(id: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('families').delete().eq('id', id);
  if (error) throw error;
}

/** Replace the whole set of families on a record. */
export async function setItemFamilies(itemId: string, familyIds: string[]) {
  const supabase = await createServerSupabase();

  const { error: clearError } = await supabase.from('item_families').delete().eq('item_id', itemId);
  if (clearError) throw clearError;

  if (!familyIds.length) return;

  const { error } = await supabase
    .from('item_families')
    .insert(familyIds.map((family_id) => ({ item_id: itemId, family_id })));

  if (error) throw error;
}

/** Approve a requested account, or move an existing one between roles. */
export async function setAccountRole(id: string, role: UserRole, actorId: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('profiles')
    .update({
      role,
      approved_by: role === 'pending' ? null : actorId,
      approved_at: role === 'pending' ? null : new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
}

/**
 * Decline a request outright.
 *
 * Deletes the auth user, which cascades to the profile. The alternative —
 * leaving it pending forever — is a row that can be approved by mistake later,
 * and an address that can never request again.
 */
export async function declineAccount(id: string) {
  const admin = createAdminSupabase();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) throw error;
}
