import 'server-only';
import { readTranslation, readTranslations } from './index';
import { needsTranslating, TRANSLATABLE_FIELDS, type TranslatableField } from './plan';
import { requestedLanguage, sourceLanguage, type ArchiveLanguage } from './languages';

/**
 * What a page shows, in the language the reader asked for.
 *
 * The archive's own rule, applied to a second kind of machine output: the
 * record is what a person wrote, and a translation is something laid over it.
 * So this never mutates the item — it returns the values to *display*, plus
 * everything the page needs to be honest about where they came from.
 *
 * Three states a page has to be able to draw:
 *
 * - **Nothing to do.** The reader is in the source language, or the record is
 *   already in theirs. `translated` is false and the page renders normally.
 * - **Translated.** Values from `item_translations`, a note saying a machine
 *   made them, and a link to the record as it was written.
 * - **Asked for and not there yet.** The originals, and a request in flight.
 *   Never a blank field, never a spinner where a description should be.
 */

export interface Presentation<T> {
  /** The record, with translated values laid over the originals. */
  item: T;
  /** The language being read in. */
  language: ArchiveLanguage;
  /** True when at least one value on screen came from the translator. */
  translated: boolean;
  /** True when something is missing and worth asking for. */
  wanted: boolean;
  /** Set when the reader has asked to see the record as it was written. */
  showingOriginal: boolean;
}

type Fielded = Partial<Record<TranslatableField, string | null>> & {
  id: string;
  language?: string | null;
};

/**
 * @param original — pass true when the reader has asked for the record as
 * written. A link rather than a toggle, so it has an address: somebody citing
 * a record can cite the words the family actually used.
 */
export async function present<T extends Fielded>(
  item: T,
  { original = false }: { original?: boolean } = {},
): Promise<Presentation<T>> {
  const [language, source] = await Promise.all([requestedLanguage(), sourceLanguage()]);

  if (language.code === source.code) {
    return { item, language, translated: false, wanted: false, showingOriginal: false };
  }

  const stored = await readTranslation(item.id, language.code).catch(() => null);
  const values = stored?.values ?? {};

  // Worth asking for: a field with words in it that has no translation yet.
  const wanted = TRANSLATABLE_FIELDS.some((field) => {
    if (field === 'transcript') return false; // volunteer-only, not on this page
    const text = (item[field] ?? '').toString();
    return needsTranslating(text) && !values[field];
  });

  if (original) {
    return { item, language, translated: false, wanted: false, showingOriginal: true };
  }

  const laid = { ...item };
  let translated = false;
  for (const field of TRANSLATABLE_FIELDS) {
    const value = values[field];
    if (value) {
      (laid as Record<string, unknown>)[field] = value;
      translated = true;
    }
  }

  return { item: laid, language, translated, wanted, showingOriginal: false };
}

/**
 * A list of records, in the reader's language.
 *
 * The portal shows titles and descriptions in a grid, and until this existed it
 * showed them in English while the menu around them was in Malayalam — the
 * archive half-translated, which is worse than either whole. One query for the
 * whole page, laid over the items the same way `present` lays over one.
 *
 * No `wanted` here, and deliberately. A page of thirty untranslated cards must
 * not fire thirty translation requests: that is the archive's daily allowance
 * spent on a scroll past. A card the reader opens asks for itself, and the
 * nightly sweep gets to the rest.
 */
export async function presentMany<T extends Fielded>(items: T[]): Promise<{
  items: T[];
  language: ArchiveLanguage;
  translated: boolean;
}> {
  const [language, source] = await Promise.all([requestedLanguage(), sourceLanguage()]);
  if (language.code === source.code || items.length === 0) {
    return { items, language, translated: false };
  }

  const stored = await readTranslations(
    items.map((item) => item.id),
    language.code,
  ).catch(() => new Map());

  let translated = false;
  const laid = items.map((item) => {
    const values = stored.get(item.id)?.values;
    if (!values) return item;
    const copy = { ...item };
    for (const field of TRANSLATABLE_FIELDS) {
      const value = values[field];
      if (value) {
        (copy as Record<string, unknown>)[field] = value;
        translated = true;
      }
    }
    return copy;
  });

  return { items: laid, language, translated };
}
