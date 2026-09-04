import { createHash } from 'node:crypto';

/**
 * What needs translating, and what does not.
 *
 * Pure, and separated from the model call on purpose: this is where the money
 * is spent and where the mistakes are cheap to make. Every decision below — is
 * this field worth a call, is the cached row still good, is the record already
 * in the language being asked for — is a decision not to spend, and each one is
 * testable without a network.
 */

/** The fields a reader sees, in the order they are read. */
export const TRANSLATABLE_FIELDS = [
  'title',
  'description',
  'provenance',
  'period',
  'origin_place',
  'transcript',
] as const;

export type TranslatableField = (typeof TRANSLATABLE_FIELDS)[number];

export interface SourceText {
  field: TranslatableField;
  value: string | null | undefined;
}

export interface CachedTranslation {
  field: TranslatableField;
  value: string;
  source: 'machine' | 'human';
  source_hash: string;
}

export interface TranslationPlan {
  /** Fields to send to the model, with the text to send. */
  translate: { field: TranslatableField; text: string; hash: string }[];
  /** What can be shown straight away. */
  ready: Record<string, string>;
  /** Fields a person has translated by hand and the machine must not touch. */
  protectedFields: TranslatableField[];
}

/**
 * The digest a cached translation is checked against.
 *
 * Whitespace-normalised, because a volunteer adding a trailing newline to a
 * description has not changed what it says and should not cost a re-translation
 * of every language. Anything beyond that — a corrected date, a name spelled
 * properly — changes the hash and the translation is remade.
 */
export function sourceHash(text: string): string {
  return createHash('sha256').update(text.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 32);
}

/**
 * Whether there is a word here at all.
 *
 * A period of "1907" and a reference of "44/2" are the same characters in every
 * language the archive publishes in; sending them costs a call and returns what
 * was already there.
 *
 * **Marks are part of a word.** The first version asked for two letters in a
 * row — `\p{Letter}{2,}` — which is true of English, Hebrew and Devanagari and
 * false of Malayalam, where a vowel sign sits between the consonants as a
 * combining mark: കൊച്ചി is ക, a mark, ച, a mark, ചി, and never two letters
 * touching. A Malayalam record would have been judged not to be words and would
 * never have been translated at all — the one community whose material is
 * mostly in Malayalam, silently excluded. Caught by a test written in the four
 * scripts the archive actually holds rather than in English.
 */
const WORD = /\p{Letter}[\p{Mark}‍]*\p{Letter}/u;

export function needsTranslating(text: string): boolean {
  return WORD.test(text.trim());
}

/**
 * Work out what a reader asking for `lang` still needs.
 *
 * Four things stop a field from being sent:
 *
 * 1. **It is empty.** Nothing to translate.
 * 2. **It is not words.** See `needsTranslating`.
 * 3. **It is already translated and still current** — the cached row's hash
 *    matches the text it was made from.
 * 4. **A person translated it.** A volunteer's correction outranks the machine
 *    permanently; the machine only ever replaces its own work. Without this,
 *    the next edit anywhere on the record would quietly throw away a human
 *    translation and put a machine's back in its place.
 */
export function planTranslation(
  sources: SourceText[],
  cached: CachedTranslation[],
): TranslationPlan {
  const byField = new Map(cached.map((row) => [row.field, row]));
  const plan: TranslationPlan = { translate: [], ready: {}, protectedFields: [] };

  for (const { field, value } of sources) {
    const text = (value ?? '').trim();
    const hit = byField.get(field);

    if (hit?.source === 'human') {
      plan.ready[field] = hit.value;
      plan.protectedFields.push(field);
      continue;
    }

    if (!text || !needsTranslating(text)) continue;

    const hash = sourceHash(text);
    if (hit && hit.source_hash === hash) {
      plan.ready[field] = hit.value;
      continue;
    }

    plan.translate.push({ field, text, hash });
  }

  return plan;
}

/**
 * Whether a record needs translating into this language at all.
 *
 * `items.language` is the language of the *material* and is free text a
 * volunteer typed — "Hebrew", "hebrew", "Hebrew and Marathi", "he". It is a
 * hint, not an identifier, so it is matched loosely and only ever used to skip
 * work: a false negative costs one needless translation, a false positive would
 * show a Hebrew reader an untranslated Hebrew record, which is fine, or an
 * English reader an untranslated Hebrew one, which is not. So it only returns
 * true when the whole field names that one language and nothing else.
 */
export function alreadyInLanguage(itemLanguage: string | null | undefined, lang: LanguageName): boolean {
  const said = (itemLanguage ?? '').trim().toLowerCase();
  if (!said) return false;
  return said === lang.code || said === lang.labelEn.toLowerCase();
}

export interface LanguageName {
  code: string;
  labelEn: string;
}

/** The free tier's per-minute allowance is gone. Not a fault, and not a wait. */
export class QuotaExhausted extends Error {
  constructor(readonly retryAfterMs: number) {
    super('the model’s quota is exhausted');
    this.name = 'QuotaExhausted';
  }
}

/**
 * How long Google says to wait, when it says.
 *
 * A 429 from `generativelanguage` carries the answer in its own message —
 * "Please retry in 33.471908418s" — because the free tier's limit is twenty
 * requests a minute. The first version guessed instead of reading it and
 * retried after 0.7s and again after 2s: three calls spent to be told the same
 * thing three times, which is what production did until its own logs were read.
 *
 * A minute when it does not say, which is the window the limit is measured over.
 */
export function retryAfterMs(message: string): number {
  const seconds = /retry in ([\d.]+)\s*s/i.exec(message)?.[1];
  return seconds ? Math.ceil(Number(seconds) * 1000) : 60_000;
}
