import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';
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

export async function addKeyword(term: string, community: Community | null) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('keywords')
    .insert({ term: term.trim(), community })
    .select()
    .single();

  if (error) throw error;
  return data;
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
    .insert({ term: candidate.term, community: candidate.community });

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
 * Never throws into the caller's path: losing a candidate is a small loss, and
 * losing the submission that produced it is not.
 */
export async function recordCandidates(
  terms: string[],
  community: Community | null,
  itemId: string | null,
): Promise<void> {
  if (!terms.length) return;

  try {
    const admin = createAdminSupabase();

    const { data: existing } = await admin.from('keywords').select('term');
    const known = new Set((existing ?? []).map((k) => (k as { term: string }).term.trim().toLowerCase()));

    const fresh = [...new Set(terms.map((t) => t.trim()).filter(Boolean))].filter(
      (t) => !known.has(t.toLowerCase()) && t.length >= 2 && t.length <= 60,
    );

    for (const term of fresh) {
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
          .insert({ term, community, first_item_id: itemId });
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
