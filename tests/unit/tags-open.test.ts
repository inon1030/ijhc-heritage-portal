import { describe, expect, it } from 'vitest';
import { normalise, normaliseChosen } from '@/lib/vocabulary/thesaurus';
import { DraftPayload } from '@/lib/items/draft-schema';

const vocabulary = [{ term: 'Mumbai', variants: ['Bombay', 'מומבאי', 'मुंबई'] }];
describe('open tag normalisation', () => {
  it('trims and folds case without limiting language', () => {
    expect(normalise('  BoMbAy  ')).toBe('bombay');
    expect(normaliseChosen(vocabulary, [' BOMBAY ', 'מומבאי', 'मुंबई', 'mumbai'])).toEqual(['Mumbai']);
  });
  it('keeps a new name once, preserving the first spelling', () => {
    expect(normaliseChosen(vocabulary, [' New tag ', 'new TAG', ' ', 'א'])).toEqual(['New tag', 'א']);
  });
  it('preserves more than twenty selections', () => {
    const tags = Array.from({ length: 75 }, (_, index) => `Tag ${index}`);
    expect(normaliseChosen([], tags)).toEqual(tags);
    expect(DraftPayload.pick({ keywords: true }).parse({ keywords: [...tags, 'x'.repeat(80)] }).keywords).toHaveLength(76);
    expect(DraftPayload.pick({ keywords: true }).safeParse({ keywords: ['x'.repeat(81)] }).success).toBe(false);
  });
});
