import { describe, expect, it } from 'vitest';
import { materialLanguage } from '@/lib/i18n/material';

const LANGUAGES = [
  { code: 'en', label_en: 'English' },
  { code: 'he', label_en: 'Hebrew' },
  { code: 'hi', label_en: 'Hindi' },
  { code: 'mr', label_en: 'Marathi' },
  { code: 'ml', label_en: 'Malayalam' },
];

/**
 * The switch under a transcription hides one language: the one the text is in.
 */
describe('the language an item is written in', () => {
  it('reads the name the model reports', () => {
    expect(materialLanguage('English', LANGUAGES)).toBe('en');
    expect(materialLanguage('marathi', LANGUAGES)).toBe('mr');
  });

  it('reads a code too', () => {
    expect(materialLanguage('he', LANGUAGES)).toBe('he');
  });

  /*
   * The bug this exists for: an English banknote read for a Hebrew speaker.
   * The material is English, so English is the one left out — Hebrew stays.
   */
  it('is the text’s language, not the reader’s', () => {
    const hidden = materialLanguage('English', LANGUAGES);
    const offered = LANGUAGES.filter((l) => l.code !== hidden).map((l) => l.code);
    expect(offered).toContain('he');
    expect(offered).not.toContain('en');
  });

  it('hides nothing when the language is unknown or not one of the archive’s', () => {
    expect(materialLanguage(null, LANGUAGES)).toBeNull();
    expect(materialLanguage('', LANGUAGES)).toBeNull();
    expect(materialLanguage('Judeo-Marathi', LANGUAGES)).toBeNull();
  });
});
