import 'server-only';
import { en, format, type Catalogue, type MessageKey } from './messages';
import { requestedLanguage, type ArchiveLanguage } from '@/lib/translate/languages';

/**
 * The interface's own words, in the language this reader asked for.
 *
 * Reads the same cookie the record translation reads, so a reader who picks
 * Malayalam gets a Malayalam menu *and* Malayalam catalogue entries from one
 * choice. There is no second switch, and there is no state where the two
 * disagree.
 *
 * The catalogues are imported statically, not read from disk. They are part of
 * the build — a few kilobytes of JSON each, tree-shaken to the one in use per
 * request — and reading them from `fs` would put a file read in front of every
 * render for data that cannot change between deploys.
 */

import he from './locales/he.json';
import hi from './locales/hi.json';
import mr from './locales/mr.json';
import ml from './locales/ml.json';

const CATALOGUES: Record<string, Catalogue> = { he, hi, mr, ml };

export interface Messages {
  /** One string, with placeholders filled. Falls back to English. */
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  language: ArchiveLanguage;
  /** `rtl` for Hebrew, `ltr` for the rest. Belongs on `<html>`. */
  dir: 'rtl' | 'ltr';
  /** The whole resolved catalogue, for handing to client components. */
  catalogue: Record<string, string>;
}

/** Everything resolved: the reader's catalogue laid over the English one. */
export function resolve(code: string): Record<string, string> {
  const translated = CATALOGUES[code] ?? {};
  return { ...en, ...translated };
}

export function reader(catalogue: Record<string, string>) {
  return (key: MessageKey, vars?: Record<string, string | number>) =>
    format(catalogue[key] ?? en[key] ?? key, vars);
}

export async function getMessages(): Promise<Messages> {
  const language = await requestedLanguage();
  const catalogue = resolve(language.code);
  return {
    t: reader(catalogue),
    language,
    dir: language.rtl ? 'rtl' : 'ltr',
    catalogue,
  };
}
