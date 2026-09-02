import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import { buildVocabulary, byBranch, type VocabularyBranch, type VocabularyTerm } from './thesaurus';
import type { Keyword } from '@/lib/types';

/**
 * The vocabulary, assembled.
 *
 * Two readers, and the difference is which client they use rather than what
 * they return. `keywords` is readable by everyone — it is how the portal labels
 * records — so neither is a permission decision; it is that the analysis route
 * serves an anonymous contributor and holds no session at all.
 */

/** For the analysis route: no session, service-role client, nested for the prompt. */
export async function loadVocabulary(): Promise<VocabularyBranch[]> {
  const { data, error } = await createAdminSupabase().from('keywords').select('*');
  if (error) throw error;
  return byBranch(buildVocabulary((data ?? []) as Keyword[]));
}

/** For screens: the caller's own session, flat, ready for `termsFor` and `byBranch`. */
export async function readVocabulary(): Promise<VocabularyTerm[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from('keywords').select('*');
  if (error) throw error;
  return buildVocabulary((data ?? []) as Keyword[]);
}
