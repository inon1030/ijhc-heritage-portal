import { describe, expect, it } from 'vitest';
import {
  alreadyInLanguage,
  needsTranslating,
  planTranslation,
  QuotaExhausted,
  retryAfterMs,
  sourceHash,
  type CachedTranslation,
  type SourceText,
} from '@/lib/translate/plan';

/**
 * What the archive decides *not* to send to a translator.
 *
 * Every test here is about money and about not overwriting a person's work.
 * The model call itself is a thin wrapper; this is where the decisions are, so
 * this is where they are pinned.
 */

const HE = { code: 'he', labelEn: 'Hebrew' };

const sources = (over: Partial<Record<string, string | null>> = {}): SourceText[] =>
  [
    { field: 'title', value: 'A ketubah from Cochin' },
    { field: 'description', value: 'Signed by two witnesses.' },
    { field: 'provenance', value: null },
    { field: 'period', value: '1907' },
    { field: 'origin_place', value: 'Bombay' },
    { field: 'transcript', value: null },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ].map((s) => (s.field in over ? { ...s, value: (over as any)[s.field] } : s)) as SourceText[];

describe('what is worth translating', () => {
  it('leaves a year, a number and a shelf mark alone', () => {
    // The same characters in every language the archive publishes in. Sending
    // them costs a call and returns what was already there.
    expect(needsTranslating('1907')).toBe(false);
    expect(needsTranslating('1890s–1910s')).toBe(false);
    expect(needsTranslating('44/2')).toBe(false);
    expect(needsTranslating('   ')).toBe(false);
  });

  it('translates anything with words in it, in any script the archive holds', () => {
    /*
     * Written in four scripts on purpose, and it caught a real one.
     *
     * Malayalam puts a combining vowel sign between its consonants, so a test
     * for "two letters in a row" is false of കൊച്ചി while being true of every
     * English and Hebrew example anybody would have thought to write. A
     * Malayalam-only record would have been treated as containing no words and
     * never translated — the Cochin community's own material, silently skipped.
     */
    expect(needsTranslating('19th century')).toBe(true);
    expect(needsTranslating('כתובה מקוצ׳ין')).toBe(true);
    expect(needsTranslating('मुंबई')).toBe(true);
    expect(needsTranslating('കൊച്ചി')).toBe(true);
    expect(needsTranslating('മലയാളം')).toBe(true);
    expect(needsTranslating('يهودي')).toBe(true);
  });

  it('sends only the fields that have something to say', () => {
    const plan = planTranslation(sources(), []);
    expect(plan.translate.map((t) => t.field)).toEqual(['title', 'description', 'origin_place']);
    // provenance is empty, period is a bare year.
    expect(plan.ready).toEqual({});
  });
});

describe('what is already done', () => {
  it('spends nothing when the cached translation still matches the record', () => {
    const cached: CachedTranslation[] = [
      { field: 'title', value: 'כתובה מקוצ׳ין', source: 'machine', source_hash: sourceHash('A ketubah from Cochin') },
    ];
    const plan = planTranslation(sources(), cached);

    expect(plan.translate.map((t) => t.field)).toEqual(['description', 'origin_place']);
    expect(plan.ready.title).toBe('כתובה מקוצ׳ין');
  });

  it('remakes it when the record has been corrected', () => {
    // The failure mode this exists for: a volunteer fixes a description and the
    // translations quietly go on saying the old thing forever.
    const cached: CachedTranslation[] = [
      { field: 'description', value: 'stale', source: 'machine', source_hash: sourceHash('Signed by one witness.') },
    ];
    const plan = planTranslation(sources(), cached);

    expect(plan.translate.map((t) => t.field)).toContain('description');
    expect(plan.ready.description).toBeUndefined();
  });

  it('does not count a trailing newline as a correction', () => {
    const cached: CachedTranslation[] = [
      { field: 'title', value: 'כתובה', source: 'machine', source_hash: sourceHash('A ketubah from Cochin') },
    ];
    const plan = planTranslation(sources({ title: '  A ketubah from Cochin\n' }), cached);
    expect(plan.ready.title).toBe('כתובה');
    expect(plan.translate.map((t) => t.field)).not.toContain('title');
  });
});

describe('a person outranks the machine', () => {
  it('never re-translates a field somebody translated by hand', () => {
    // Even though the record itself has changed underneath it. A volunteer's
    // Hebrew is the archive's Hebrew until they say otherwise; silently
    // replacing it with a model's is the one unrecoverable move here.
    const cached: CachedTranslation[] = [
      { field: 'description', value: 'חתום בידי שני עדים.', source: 'human', source_hash: 'from-a-much-older-version' },
    ];
    const plan = planTranslation(sources(), cached);

    expect(plan.translate.map((t) => t.field)).not.toContain('description');
    expect(plan.ready.description).toBe('חתום בידי שני עדים.');
    expect(plan.protectedFields).toEqual(['description']);
  });
});

describe('a record already in the language being asked for', () => {
  it('is not sent anywhere', () => {
    expect(alreadyInLanguage('Hebrew', HE)).toBe(true);
    expect(alreadyInLanguage('hebrew', HE)).toBe(true);
    expect(alreadyInLanguage('he', HE)).toBe(true);
  });

  it('is translated whenever the field is unclear, because a needless translation is the cheaper mistake', () => {
    // `items.language` is free text a volunteer typed. Reading it loosely would
    // eventually show an English reader an untranslated Hebrew record; reading
    // it strictly costs one translation that was not needed.
    expect(alreadyInLanguage('Hebrew and Marathi', HE)).toBe(false);
    expect(alreadyInLanguage('Judeo-Arabic', HE)).toBe(false);
    expect(alreadyInLanguage(null, HE)).toBe(false);
    expect(alreadyInLanguage('', HE)).toBe(false);
  });
});

describe('the free tier runs out, and that is not a fault', () => {
  it('reads the wait out of the message rather than guessing it', () => {
    // Google's 429 says exactly how long: "Please retry in 33.471908418s".
    // The first version guessed and retried after 0.7s and again after 2s —
    // three calls spent to be told the same thing three times, which is what
    // production did until its own logs were read.
    expect(retryAfterMs('… Please retry in 33.471908418s.')).toBe(33_472);
    expect(retryAfterMs('Please retry in 7s')).toBe(7_000);
    expect(retryAfterMs('please retry in 12.5 s')).toBe(12_500);
  });

  it('falls back to the window the limit is measured over', () => {
    expect(retryAfterMs('quota exceeded')).toBe(60_000);
    expect(retryAfterMs('')).toBe(60_000);
  });

  it('carries the wait on the error, so a caller can decide rather than guess', () => {
    const error = new QuotaExhausted(33_472);
    expect(error).toBeInstanceOf(Error);
    expect(error.retryAfterMs).toBe(33_472);
  });
});
