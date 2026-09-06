import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { en, format } from '@/lib/i18n/messages';
import { reader, resolve } from '@/lib/i18n';

/**
 * The interface catalogue, and the two ways it can quietly go wrong.
 *
 * **A missing key must fall back to English, never render as `nav.portal`.**
 * The allowance is twenty model calls a day per model, so a language genuinely
 * arrives in pieces — and a half-finished catalogue has to produce a page that
 * is merely mixed, not a page covered in identifiers. Measured on the last
 * generation run: Malayalam finished 361 of 364.
 *
 * **A placeholder must survive translation.** `{count}` dropped by a model
 * leaves a sentence with a hole in it that reads as finished — "records
 * published" with no number — and nothing in the page says anything is wrong.
 * The generator rejects those, and this pins the rule for every locale file in
 * the repository rather than trusting the generator's own report of itself.
 */

const LOCALES = path.join(process.cwd(), 'src/lib/i18n/locales');
// `.sources.json` sits beside the locales and is not one: it maps language ->
// key -> hash of the English that translation was made from. Sweeping the
// directory without excluding it made the suite read its language names as
// message keys and fail — which is at least the right kind of failure.
const codes = fs
  .readdirSync(LOCALES)
  .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
  .map((f) => f.replace('.json', ''));

function catalogue(code: string): Record<string, string> {
  return JSON.parse(fs.readFileSync(path.join(LOCALES, `${code}.json`), 'utf8'));
}

describe('filling placeholders', () => {
  it('replaces what it is given', () => {
    expect(format('Reading in {language}.', { language: 'עברית' })).toBe('Reading in עברית.');
    expect(format('{count} records published', { count: 8 })).toBe('8 records published');
  });

  it('leaves an unknown placeholder alone rather than printing "undefined"', () => {
    expect(format('{count} records', {})).toBe('{count} records');
  });

  it('is a no-op when there is nothing to fill', () => {
    expect(format('Portal')).toBe('Portal');
  });
});

describe('reading a string', () => {
  it('prefers the translation', () => {
    const t = reader({ ...en, 'nav.portal': 'פורטל' });
    expect(t('nav.portal')).toBe('פורטל');
  });

  it('falls back to English for a key the language has not reached yet', () => {
    const t = reader({ 'nav.portal': 'פורטל' });
    expect(t('nav.contribute')).toBe(en['nav.contribute']);
  });

  it('never renders the key itself for a string the catalogue knows', () => {
    const t = reader({});
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(t(key)).not.toBe(key);
    }
  });
});

describe('every locale file in the repository', () => {
  it('has at least one language besides the source', () => {
    expect(codes.length).toBeGreaterThan(0);
  });

  it.each(codes)('%s holds no key the English has dropped', (code) => {
    const extra = Object.keys(catalogue(code)).filter((key) => !(key in en));
    expect(extra).toEqual([]);
  });

  it.each(codes)('%s keeps every placeholder its English has', (code) => {
    const table = catalogue(code);
    const lost: string[] = [];

    for (const [key, value] of Object.entries(table)) {
      const wanted = [...(en[key as keyof typeof en] ?? '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      for (const name of wanted) {
        if (!value.includes(`{${name}}`)) lost.push(`${key} lost {${name}}`);
      }
    }

    expect(lost).toEqual([]);
  });

  it.each(codes)('%s resolves to a complete catalogue once laid over English', (code) => {
    const resolved = resolve(code);
    expect(Object.keys(resolved).length).toBeGreaterThanOrEqual(Object.keys(en).length);
    for (const key of Object.keys(en)) {
      expect(resolved[key]).toBeTruthy();
    }
  });
});

/**
 * The record of what each translation was made from.
 *
 * A key whose English has been edited since is worse than a missing one: it
 * reads as finished while saying the old thing. Caught live — `prereview.heading`
 * was changed from "What the archive found" to "What the AI found" and the
 * Hebrew page went on saying `מה שהארכיון מצא`, with nothing anywhere reporting
 * a problem. `npm run i18n` compares against these hashes and remakes what has
 * drifted; the sidecar is only useful if it stays in step with the locales.
 */
describe('the record of what each translation was made from', () => {
  const sources: Record<string, Record<string, string>> = JSON.parse(
    fs.readFileSync(path.join(LOCALES, '.sources.json'), 'utf8'),
  );

  it('covers every language that has a locale file', () => {
    expect(Object.keys(sources).sort()).toEqual([...codes].sort());
  });

  it.each(codes)('%s has a recorded source for every string it holds', (code) => {
    const table = catalogue(code);
    const unstamped = Object.keys(table).filter((key) => !sources[code]?.[key]);
    expect(unstamped).toEqual([]);
  });

  it.each(codes)('%s records nothing for a string it does not hold', (code) => {
    // `catalogue()` reads and parses the file, so it is called once here and
    // not once per key — the first version did the latter and timed out at
    // five seconds on a 437-key catalogue.
    const table = catalogue(code);
    const orphaned = Object.keys(sources[code] ?? {}).filter((key) => !table[key]);
    expect(orphaned).toEqual([]);
  });
});
