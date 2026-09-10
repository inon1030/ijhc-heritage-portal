import type { MessageKey } from '@/lib/i18n/messages';
import { EVIDENCE_BASIS_LABELS, type Community, type EvidenceBasis, type ItemCategory } from '@/lib/types';
import { categoryKey, communityKey } from '@/lib/i18n/labels';
import type { FieldDef, FieldGroupKey, FieldOption } from './registry';

/**
 * The logical tree, in the reader's language.
 *
 * ── why the registry still holds English ────────────────────────────────────
 *
 * A facet's label is two different things at once, and separating them is the
 * whole point of this file.
 *
 * It is a **stored value**: adding "Temples" to a record writes the string
 * `Temples` into `item_fields.value`, an export reads as English, and the
 * portal's filters match on it. That must not move when somebody switches the
 * interface to Marathi — a record would change what it says depending on who
 * was looking at it when it was saved.
 *
 * It is also a **label on a screen**, and there it has no business being
 * English in front of a reader who asked for Malayalam.
 *
 * So the registry keeps the first and the catalogue holds the second, and a
 * test pins the English side of the catalogue to the registry so the two
 * cannot drift.
 *
 * ── the one thing left in English on purpose ────────────────────────────────
 *
 * `path` — "The EHIC Archive Project > Content Domains > Religious and Art" —
 * is a citation of Erez's own spreadsheet, the way a footnote names a source in
 * the language the source is written in. The sentence around it is translated;
 * the address inside it is not. Say the word and it becomes segment keys.
 */

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export const fieldLabelKey = (key: string) => `field.${key}.label` as MessageKey;
export const fieldHintKey = (key: string) => `field.${key}.hint` as MessageKey;
export const groupLabelKey = (group: FieldGroupKey) => `group.${group}.label` as MessageKey;
export const groupBlurbKey = (group: FieldGroupKey) => `group.${group}.blurb` as MessageKey;
export const basisKey = (basis: EvidenceBasis) => `basis.${basis}` as MessageKey;

/** A field's name, translated. Falls back to the registry's English. */
export function fieldLabel(t: Translate, def: { key: string; label: string }): string {
  const drawn = t(fieldLabelKey(def.key));
  // `t` answers with the key itself when nothing holds it — see the provider.
  // A field added to the registry and not yet to the catalogue shows its
  // English name, never `field.domain.food.label`.
  return drawn === fieldLabelKey(def.key) ? def.label : drawn;
}

/**
 * The line under the input.
 *
 * A facet has no hint of its own — the registry generates "Filed under …" from
 * the path — so it is composed here from a translated frame and an untranslated
 * address, rather than being fifty near-identical catalogue entries that all
 * have to agree with each other about the same four words.
 */
export function fieldHint(t: Translate, def: FieldDef): string {
  if (def.hint.startsWith('Filed under ')) return t('fields.filedUnder', { path: def.path });
  const drawn = t(fieldHintKey(def.key));
  return drawn === fieldHintKey(def.key) ? def.hint : drawn;
}

/**
 * An option on one of the two enum fields.
 *
 * Kind and community already have catalogue entries — they are on the portal's
 * filters and on every record card — so this reuses them rather than making a
 * second Hebrew for "Documents" that could disagree with the first.
 */
export function optionLabel(t: Translate, def: FieldDef, option: FieldOption): string {
  if (def.column === 'category') return t(categoryKey(option.value as ItemCategory));
  if (def.column === 'community') return t(communityKey(option.value as Community));
  return option.label;
}

/** What a value rests on: read, inferred, or guessed. */
export function basisLabel(t: Translate, basis: EvidenceBasis): string {
  const drawn = t(basisKey(basis));
  return drawn === basisKey(basis) ? EVIDENCE_BASIS_LABELS[basis] : drawn;
}
