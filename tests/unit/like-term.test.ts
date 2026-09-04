import { describe, expect, it } from 'vitest';
import { likeTerm } from '@/lib/items/queries';

/**
 * Escaping a search term for `ilike`.
 *
 * Small, and it has been wrong once. `%` and `_` are wildcards, so an unescaped
 * term turns a search into a match-everything — and when the same three lines
 * were written out a second time for the count query, an over-escaped backslash
 * silently turned the escape into an escaped dollar sign, producing the literal
 * text `${c}`. The list and the count then filtered differently, which shows up
 * as a wrong number on a page rather than as an error.
 *
 * Written with `String.raw` throughout. The first version of this file spelled
 * the expected values with ordinary escapes and got one of them wrong, so the
 * test failed while the code was right — backslashes counted by eye through two
 * layers of quoting is exactly the mistake being tested for.
 */
describe('a search term made safe for ilike', () => {
  it('escapes the wildcards so a search means what it says', () => {
    expect(likeTerm('50%')).toBe(String.raw`50\%`);
    expect(likeTerm('MS_44')).toBe(String.raw`MS\_44`);
    expect(likeTerm('%')).toBe(String.raw`\%`);
    expect(likeTerm('%_%')).toBe(String.raw`\%\_\%`);
  });

  it('escapes the escape character itself', () => {
    // Otherwise a trailing backslash escapes the wildcard the caller wraps
    // around the term, and the pattern means something else entirely.
    expect(likeTerm(String.raw`a\b`)).toBe(String.raw`a\\b`);
    expect(likeTerm('\\')).toBe(String.raw`\\`);
  });

  it('leaves ordinary searches alone, in any script the archive holds', () => {
    expect(likeTerm('Ezra')).toBe('Ezra');
    expect(likeTerm('  Bene Israel  ')).toBe('Bene Israel');
    expect(likeTerm('כתובה')).toBe('כתובה');
    expect(likeTerm('കൊച്ചി')).toBe('കൊച്ചി');
    expect(likeTerm('मुंबई')).toBe('मुंबई');
  });
});
