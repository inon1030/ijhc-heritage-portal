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
  return readUploadVocabulary();
}

/** Upload searches every community, language and variant, without PostgREST's row cap. */
export async function readUploadVocabulary(): Promise<VocabularyTerm[]> {
  const supabase = await createServerSupabase();
  const rows: Keyword[] = [];
  const translations: { keyword_id: string; label: string }[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('keywords').select('*').order('id').range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data ?? []) as Keyword[]);
    if ((data?.length ?? 0) < 500) break;
  }
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('keyword_translations').select('keyword_id,label').order('keyword_id').order('lang').range(offset, offset + 499);
    if (error) throw error;
    translations.push(...(data ?? []) as { keyword_id: string; label: string }[]);
    if ((data?.length ?? 0) < 500) break;
  }
  const terms = buildVocabulary(rows);
  for (const translation of translations) {
    const row = rows.find(row => row.id === translation.keyword_id);
    const term = terms.find(term => term.id === (row?.preferred_id ?? row?.id));
    if (term && !term.variants.includes(translation.label)) term.variants.push(translation.label);
  }
  return terms;
}
