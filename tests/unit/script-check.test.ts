import { describe, expect, it } from 'vitest';
import { isPlausiblyIn } from '@/lib/translate/plan';

const he = { code: 'he', labelEn: 'Hebrew' };
const ml = { code: 'ml', labelEn: 'Malayalam' };
const mr = { code: 'mr', labelEn: 'Marathi' };

/**
 * Catching a model that has lost the script it was asked for.
 *
 * Every string below that is rejected was produced by a real model against
 * production, translating the archive's own catalogue text. The lite model
 * slid out of Malayalam mid-word — into Cyrillic and an English apology in one
 * sample, into Gurmukhi and Devanagari in another — and returned it with
 * `finishReason: STOP`, so nothing about the response said it had gone wrong.
 *
 * The strings that are accepted matter just as much. The archive deliberately
 * keeps names in Latin inside a translated field, because a family searching
 * for "Sir David Ezra" should find it spelled the way the photograph spells it.
 * A check that rejected those would have quietly emptied the archive instead.
 */
describe('a translation written in the script it was asked for', () => {
  it('accepts the target script', () => {
    expect(isPlausiblyIn('ഒരു തോറ പെട്ടകത്തിന്റെ തിരശ്ശീല', ml)).toBe(true);
    expect(isPlausiblyIn('כתובה מקוצ׳ין', he)).toBe(true);
    expect(isPlausiblyIn('मुंबईतील एक छायाचित्र', mr)).toBe(true);
  });

  it('keeps names, dates and punctuation in Latin, which is how the archive writes them', () => {
    // The stored Malayalam for a Calcutta portrait, verbatim from the database.
    expect(isPlausiblyIn('കൊൽക്കത്തയിലെ (Calcutta) Sir David Ezra ഒപ്പുവെച്ച', ml)).toBe(true);
    expect(isPlausiblyIn('סר דיוויד עזרא, Calcutta, 1935', he)).toBe(true);
    expect(isPlausiblyIn('Bene Israel — 1901–1947', mr)).toBe(true);
  });

  it('rejects a Malayalam translation that runs into another script', () => {
    // Measured from gemini-3.5-flash-lite, mid-title.
    expect(isPlausiblyIn('തിരശ്ശീলাйбх - sorry, correcting Malayalam', ml)).toBe(false);
    // Measured from gemini-flash-lite-latest: Malayalam into Gurmukhi.
    expect(isPlausiblyIn('പരേഡേഷി സിനഗോഗിൽ നിന്നുള്ള ਉੰਤੂਰੇਂਸ਼ਿ', ml)).toBe(false);
  });

  it('rejects Hebrew that has drifted into a third script', () => {
    expect(isPlausiblyIn('כתובה مِن كوتشين', he)).toBe(false);
  });

  it('does not check a language it has no script for, so a new row cannot break itself', () => {
    // Adding Judeo-Arabic to `archive_languages` must not start rejecting its
    // own translations because a constant here was not updated too.
    expect(isPlausiblyIn('أي نص على الإطلاق', { code: 'jrb', labelEn: 'Judeo-Arabic' })).toBe(true);
  });

  it('accepts an empty string and a string with no letters at all', () => {
    expect(isPlausiblyIn('', ml)).toBe(true);
    expect(isPlausiblyIn('1901–1947 · 12 × 18 cm', ml)).toBe(true);
  });
});

/**
 * The check is not applied to the transcript, and this is why.
 *
 * Run against every translation the archive had already stored, this rejected
 * two of fifty-three. One was the fault it was written for: a Hindi title from
 * the lite model reading `भारतीय यहूदी पारिवारिक चित्रણैं? Indian Jewish family
 * portrait` — Devanagari with a Gujarati letter spliced into a word, a question
 * mark, and then the English it had failed to translate, live on the site.
 *
 * The other was a correct translation. A transcription quotes the document, and
 * the document — a 1940s Ajmer film playbill — is printed in Urdu and Hindi
 * together. A transcript that held only one of them would be the broken one.
 */
describe('the transcript, which quotes the document rather than describing it', () => {
  const playbill = 'yahoodi-ki-larki یهودی کی لڑکی\nसभी बोलता हुआ उर्दू नाटक';

  it('would be rejected by the bare script test', () => {
    expect(isPlausiblyIn(playbill, { code: 'hi', labelEn: 'Hindi' })).toBe(false);
  });

  it('and the corrupt Hindi title it exists to catch still fails', () => {
    expect(
      isPlausiblyIn('भारतीय यहूदी पारिवारिक चित्रણैं? Indian Jewish family portrait', {
        code: 'hi',
        labelEn: 'Hindi',
      }),
    ).toBe(false);
  });
});
