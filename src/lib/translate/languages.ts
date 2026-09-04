import 'server-only';
import { cookies } from 'next/headers';
import { createAdminSupabase } from '@/lib/supabase/admin';

/**
 * The languages the archive publishes in.
 *
 * Read from `archive_languages` rather than a constant, so adding Judeo-Arabic
 * is a row rather than a deploy — and so the picker can name each language in
 * its own script, which is the difference between a list somebody can use and a
 * list of English words about languages they do not read.
 *
 * Cached for the life of the process. This changes about once a year, and a
 * database round trip on every page render to learn that there are still five
 * of them is a round trip for nothing.
 */

export interface ArchiveLanguage {
  code: string;
  label_en: string;
  label_native: string;
  rtl: boolean;
  is_source: boolean;
}

export const LANGUAGE_COOKIE = 'ijhc.lang';

let cache: { at: number; languages: ArchiveLanguage[] } | null = null;
const CACHE_MS = 5 * 60_000;

export async function listLanguages(): Promise<ArchiveLanguage[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.languages;

  // The admin client, because this is read while rendering pages for anonymous
  // visitors and the list is public anyway — `archive_languages_read` admits it
  // to `anon`. Using the admin client here only avoids a session lookup.
  const { data, error } = await createAdminSupabase()
    .from('archive_languages')
    .select('code, label_en, label_native, rtl, is_source')
    .eq('enabled', true)
    .order('position');

  if (error) throw error;

  const languages = (data ?? []) as ArchiveLanguage[];
  cache = { at: Date.now(), languages };
  return languages;
}

export async function getLanguage(code: string): Promise<ArchiveLanguage | null> {
  return (await listLanguages()).find((l) => l.code === code) ?? null;
}

/** The language the archive is written in, and what everything falls back to. */
export async function sourceLanguage(): Promise<ArchiveLanguage> {
  const languages = await listLanguages();
  return languages.find((l) => l.is_source) ?? languages[0];
}

/**
 * The language this reader has asked for.
 *
 * A cookie, not a URL segment. The archive's addresses are permanent — a record
 * page is cited and linked to, and the receipt a contributor keeps points at
 * one — so putting a language in the path would either fork every address into
 * five or break the ones already handed out. The reader's choice is theirs, not
 * the record's.
 *
 * Anything not in the table falls back to the source language, so a stale or
 * hand-edited cookie cannot ask for a translation that does not exist.
 */
export async function requestedLanguage(): Promise<ArchiveLanguage> {
  const asked = (await cookies()).get(LANGUAGE_COOKIE)?.value;
  if (!asked) return sourceLanguage();
  return (await getLanguage(asked)) ?? (await sourceLanguage());
}
