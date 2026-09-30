import { describe, expect, it } from 'vitest';
import { provenance, wordOrigins } from '@/lib/text/word-diff';

/**
 * Michal's request (24.09): show the knowledge expert which words of a
 * description were the AI's and which the contributor wrote.
 */

describe('provenance of a description', () => {
  it('is nothing when the contributor left it empty', () => {
    expect(provenance('A silver pointer.', '  ')).toEqual({ kind: 'none' });
  });

  it('is the contributor\'s own when there was no AI text', () => {
    expect(provenance(null, 'My grandmother\'s ketubah.')).toEqual({ kind: 'own' });
  });

  it('is the AI\'s when accepted unchanged, ignoring outer spaces', () => {
    expect(provenance('A silver pointer.', ' A silver pointer. ')).toEqual({ kind: 'unchanged' });
  });

  it('is the contributor\'s own when nothing of the AI text is left', () => {
    expect(provenance('A silver pointer.', 'Wedding photo, Bombay')).toEqual({ kind: 'own' });
  });

  it('marks the words the contributor added and keeps the text exact', () => {
    const result = provenance(
      'A wedding photograph taken in a studio.',
      'A wedding photograph of my grandmother taken in a studio in Bombay, 1907.',
    );
    expect(result.kind).toBe('edited');
    if (result.kind !== 'edited') return;
    expect(result.pieces.map((p) => p.text).join('')).toBe(
      'A wedding photograph of my grandmother taken in a studio in Bombay, 1907.',
    );
    expect(result.pieces.filter((p) => p.origin === 'person').map((p) => p.text.trim())).toEqual([
      'of my grandmother',
      'studio in Bombay, 1907.',
    ]);
    expect(result.pieces.filter((p) => p.origin === 'ai').map((p) => p.text.trim())).toEqual([
      'A wedding photograph',
      'taken in a',
    ]);
    // "studio." no longer matches "studio" — a changed word counts as removed and added.
    expect(result.removed).toBe(1);
  });

  it('works on Hebrew', () => {
    const result = provenance('כתובה מקוצ\'ין.', 'כתובה של סבתא שלי מקוצ\'ין.');
    expect(result.kind).toBe('edited');
    if (result.kind !== 'edited') return;
    expect(result.pieces.filter((p) => p.origin === 'person').map((p) => p.text.trim())).toEqual([
      'של סבתא שלי',
    ]);
    expect(result.added).toBe(3);
  });

  it('counts words the contributor deleted', () => {
    expect(wordOrigins('one two three four', 'one four').removed).toBe(2);
  });
});
