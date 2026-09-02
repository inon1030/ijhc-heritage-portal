import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import type { Family, KeywordCandidate, Profile } from '@/lib/types';

/**
 * Reads for the controlled vocabulary, the family register, and the account
 * roll. Everything here goes through the session client, so RLS decides what
 * comes back — the candidates queue and the account roll return nothing at all
 * without the right role, whatever the calling code asks for.
 */

/** What the model proposed and the vocabulary does not hold. Volunteers only. */
export async function listOpenCandidates(): Promise<KeywordCandidate[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('keyword_candidates')
    .select('*')
    .eq('status', 'open')
    .order('seen_count', { ascending: false })
    .order('term', { ascending: true });

  if (error) throw error;
  return (data ?? []) as KeywordCandidate[];
}

export async function listFamilies(): Promise<Family[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('families')
    .select('*')
    .order('community', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Family[];
}

/** The families already attached to a record. */
export async function listItemFamilyIds(itemId: string): Promise<string[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('item_families')
    .select('family_id')
    .eq('item_id', itemId);

  if (error) throw error;
  return (data ?? []).map((row) => (row as { family_id: string }).family_id);
}

/** The families on one record, for the public record page. */
export async function listItemFamilies(itemId: string): Promise<Family[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('item_families')
    .select('families(*)')
    .eq('item_id', itemId);

  if (error) throw error;
  return (data ?? [])
    .flatMap((row) => (row as { families: Family | Family[] | null }).families ?? [])
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Everyone with an account, pending ones first — they are the ones needing a decision. */
export async function listAccounts(): Promise<Profile[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('role', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as Profile[];
  const rank = { pending: 0, admin: 1, volunteer: 2 } as const;
  return rows.sort((a, b) => rank[a.role] - rank[b.role]);
}
