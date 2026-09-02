import type { EvidenceBasis, EvidenceLedger } from '@/lib/types';
import { fieldDef, normaliseValue } from './registry';
import { fileKind } from '@/lib/files/validate';

/**
 * The 70% rule.
 *
 * A suggestion reaches a volunteer only if the model is at least this sure of
 * it. Everything else is discarded here, on the server, before it is stored or
 * rendered — not hidden in the interface. A reviewer's screen shows what
 * survived and says nothing at all about what did not, which is the point:
 * a queue of eighteen fields where twelve are noise is slower to clear than a
 * queue of six.
 */
export const SUGGESTION_THRESHOLD = 0.7;

/**
 * The ceiling a guess can reach.
 *
 * This is the load-bearing line in the file, and it is worth being plain about
 * why it exists.
 *
 * A self-reported confidence is worth very little on its own. The archive
 * already learned that the hard way: across the first fifteen analyses every
 * value the model returned landed on a 0.05 grid and eight of them were
 * exactly 0.95, which is why the number was taken off the reviewer's screen in
 * the first place (ADR-012). Gating on a number like that would filter nothing
 * — everything would clear 70% and the rule would be decoration.
 *
 * So the number is not trusted by itself. It is anchored to the basis, which
 * *is* checkable, because the model must also name the thing it looked at:
 *
 *   read      it is written in the material and was transcribed
 *   inferred  drawn from style, dress, printing, architecture
 *   guess     neither
 *
 * A guess is capped below the threshold no matter what confidence came back
 * with it. That makes "above 70%" mean something a person can verify — the
 * suggestion rests on something the model can name — rather than something
 * only the model can assert.
 */
const GUESS_CEILING = 0.4;

/** An inference is real evidence, but it is not reading. It cannot be near-certain. */
const INFERRED_CEILING = 0.9;

export interface FieldSuggestion {
  key: string;
  value: string;
  confidence: number;
  basis: EvidenceBasis;
  /** One short clause naming what was looked at. This is what a reviewer checks. */
  note: string | null;
}

function clamp(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function asBasis(value: unknown): EvidenceBasis | null {
  return value === 'read' || value === 'inferred' || value === 'guess' ? value : null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The confidence a suggestion is actually credited with, after its basis is applied. */
export function effectiveConfidence(basis: EvidenceBasis, reported: number): number {
  if (basis === 'guess') return Math.min(reported, GUESS_CEILING);
  if (basis === 'inferred') return Math.min(reported, INFERRED_CEILING);
  return reported;
}

/**
 * Turns whatever the model returned into the suggestions a volunteer may see.
 *
 * Everything that is malformed, unknown to the tree, invalid for its field, or
 * below the threshold is dropped. One suggestion per field: if the model
 * repeats a key, the more confident answer wins, which also means a later
 * low-confidence retraction cannot quietly replace a good reading.
 */
export function gateSuggestions(raw: unknown): FieldSuggestion[] {
  if (!Array.isArray(raw)) return [];

  const best = new Map<string, FieldSuggestion>();

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;

    const key = nonEmpty(row.key);
    const stated = nonEmpty(row.value);
    const basis = asBasis(row.basis);
    if (!key || !stated || !basis) continue;

    if (!fieldDef(key)) continue;

    // Normalised, not merely checked: "Bene-Israel" and "yes" are answers the
    // archive can use, and throwing them away wastes a reading that was made.
    const value = normaliseValue(key, stated);
    if (value === null) continue;

    const confidence = effectiveConfidence(basis, clamp(row.confidence));
    if (confidence < SUGGESTION_THRESHOLD) continue;

    const suggestion: FieldSuggestion = { key, value, confidence, basis, note: nonEmpty(row.note) };
    const held = best.get(key);
    if (!held || suggestion.confidence > held.confidence) best.set(key, suggestion);
  }

  return [...best.values()];
}

/**
 * Folds several files' suggestions into the one set a record carries.
 *
 * A record can be five pages of a document, read one page at a time. Page one
 * usually carries the imprint and page three the date, so taking only the
 * primary file's answers throws away most of what was found. Highest
 * confidence wins a contested field, which is the same rule as within a single
 * file and means the order the pages were uploaded in decides nothing.
 */
export function mergeSuggestions(perFile: FieldSuggestion[][]): FieldSuggestion[] {
  const best = new Map<string, FieldSuggestion>();

  for (const suggestions of perFile) {
    for (const suggestion of suggestions) {
      const held = best.get(suggestion.key);
      if (!held || suggestion.confidence > held.confidence) best.set(suggestion.key, suggestion);
    }
  }

  return [...best.values()];
}

/**
 * The media branch the file itself settles.
 *
 * Whether something is a photograph is a fact about its first bytes, and the
 * archive measures those. Asked instead, the model returned "Images, inferred,
 * 0.98" — a confident opinion about something already known for certain, which
 * is both a wasted field and the thing project rule 2 exists to prevent.
 *
 * So this is derived, marked `read`, and given 1: nothing was inferred and
 * nothing was generated. A PDF gets no branch — Erez's Digital Media list has
 * no entry for one, and "Documents and manuscripts" is a judgement about the
 * contents rather than the container.
 */
export function mediaFacetFrom(mimeType: string): FieldSuggestion | null {
  const key = {
    image: 'media.digital.images',
    video: 'media.digital.video',
    audio: 'media.digital.sound',
  }[fileKind(mimeType) as string];

  if (!key) return null;

  return {
    key,
    value: fieldDef(key)!.label,
    confidence: 1,
    basis: 'read',
    note: `the file is ${mimeType}`,
  };
}

/** Looks up one field's surviving suggestion. */
export function suggestionFor(
  suggestions: FieldSuggestion[],
  key: string,
): FieldSuggestion | undefined {
  return suggestions.find((s) => s.key === key);
}

/**
 * The evidence ledger, derived rather than asked for separately.
 *
 * The model used to fill a ledger *and* a set of suggested values, which is the
 * same knowledge written down twice — and the two drifted apart, because
 * nothing made them agree. Now there is one answer per field carrying its own
 * basis and note, and the ledger is a view of it. A field that did not clear
 * 70% has no row, which is correct: there is nothing to weigh.
 */
export function ledgerFrom(suggestions: FieldSuggestion[]): EvidenceLedger | null {
  if (!suggestions.length) return null;
  return Object.fromEntries(
    suggestions.map((s) => [s.key, { basis: s.basis, note: s.note }]),
  ) as EvidenceLedger;
}
