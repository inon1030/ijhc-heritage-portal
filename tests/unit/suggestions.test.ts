import { describe, expect, it } from 'vitest';
import {
  SUGGESTION_THRESHOLD,
  effectiveConfidence,
  gateSuggestions,
  ledgerFrom,
  mergeSuggestions,
} from '@/lib/fields/suggestions';
import { FIELDS, isCorrected, isValidValue } from '@/lib/fields/registry';
import { communityOrCatchAll } from '@/lib/ai/community';

/**
 * The 70% gate.
 *
 * This is the one piece of logic in the archive that decides what a volunteer
 * is asked to look at, so it is tested at the boundary rather than in the
 * middle. The interesting cases are all about a model that is wrong about
 * itself: it says 0.95 for a guess, it answers a field that does not exist, it
 * gives a community that is not one of the five.
 */

const read = (over: Record<string, unknown> = {}) => ({
  key: 'origin_place',
  value: 'Calcutta, India',
  basis: 'read',
  note: 'the imprint reads Calcutta',
  confidence: 0.92,
  ...over,
});

describe('the 70% gate', () => {
  it('keeps a confident reading', () => {
    const [kept] = gateSuggestions([read()]);
    expect(kept.key).toBe('origin_place');
    expect(kept.value).toBe('Calcutta, India');
    expect(kept.confidence).toBeCloseTo(0.92);
  });

  it('drops anything under the threshold', () => {
    expect(gateSuggestions([read({ confidence: 0.69 })])).toEqual([]);
  });

  it('keeps a suggestion sitting exactly on the threshold', () => {
    expect(gateSuggestions([read({ confidence: SUGGESTION_THRESHOLD })])).toHaveLength(1);
  });

  it('discards a guess however confident it claims to be', () => {
    // The whole reason the threshold is worth having. A model left to rate
    // itself returns 0.95 for everything, so the number is anchored to the
    // basis: a guess cannot buy its way onto a reviewer's screen.
    expect(gateSuggestions([read({ basis: 'guess', confidence: 1 })])).toEqual([]);
  });

  it('lets an inference through, but not at certainty', () => {
    const [kept] = gateSuggestions([read({ basis: 'inferred', confidence: 1 })]);
    expect(kept.confidence).toBeLessThan(1);
    expect(kept.confidence).toBeGreaterThanOrEqual(SUGGESTION_THRESHOLD);
  });

  it('drops a field the tree does not have', () => {
    expect(gateSuggestions([read({ key: 'gps_coordinates' })])).toEqual([]);
  });

  it('drops a value an enum field cannot hold', () => {
    // "Bene-Israel" would reach a Postgres enum column and be rejected there,
    // several layers from anything that could explain why.
    expect(gateSuggestions([read({ key: 'community', value: 'Bene-Israel' })])).toEqual([]);
    expect(gateSuggestions([read({ key: 'community', value: 'bene_israel' })])).toHaveLength(1);
  });

  it('drops entries missing a basis, a value, or a key', () => {
    expect(
      gateSuggestions([
        read({ basis: undefined }),
        read({ value: '   ' }),
        read({ key: null }),
        'not an object',
        null,
      ]),
    ).toEqual([]);
  });

  it('returns nothing for a response that is not a list', () => {
    expect(gateSuggestions(undefined)).toEqual([]);
    expect(gateSuggestions({ origin_place: 'Calcutta' })).toEqual([]);
  });

  it('keeps the most confident answer when a field is answered twice', () => {
    const kept = gateSuggestions([
      read({ value: 'Bombay, India', confidence: 0.75 }),
      read({ value: 'Calcutta, India', confidence: 0.93 }),
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].value).toBe('Calcutta, India');
  });
});

describe('the two kinds of node', () => {
  // The document calls itself a multi-affiliation hierarchy. A branch is
  // something a record is filed under, so the only answer it takes is its own
  // name — and a model asked "does this belong under Food?" says "yes" about
  // as often as it says "Food".
  it('accepts a branch by its name, by yes, and in any case', () => {
    for (const said of ['Food', 'food', 'yes', 'TRUE']) {
      const [kept] = gateSuggestions([read({ key: 'domain.lifestyle.food', value: said })]);
      expect(kept?.value).toBe('Food');
    }
  });

  it('refuses to file a record under a branch it was not asked about', () => {
    expect(gateSuggestions([read({ key: 'domain.lifestyle.food', value: 'Marriage' })])).toEqual([]);
    expect(gateSuggestions([read({ key: 'domain.lifestyle.food', value: 'no' })])).toEqual([]);
  });

  it('takes a question field at its word', () => {
    const [kept] = gateSuggestions([read({ key: 'map.geo.cities_villages', value: 'Alibag' })]);
    expect(kept.value).toBe('Alibag');
  });

  it('catalogues only the three domains that describe holdings', () => {
    // Goals, Stakeholders and Project Organization describe the project. A
    // photograph cannot be "Finance", and a model handed the field would
    // answer anyway.
    const keys = FIELDS.map((f) => f.key);
    expect(keys.some((k) => k.startsWith('domain.'))).toBe(true);
    expect(keys.some((k) => k.startsWith('media.'))).toBe(true);
    expect(keys.some((k) => k.startsWith('map.'))).toBe(true);
    for (const absent of ['goals', 'stakeholders', 'org']) {
      expect(keys.some((k) => k.startsWith(`${absent}.`))).toBe(false);
    }
  });
});

describe('two shelves, not one', () => {
  // "From India and unplaceable" and "not ours at all" are different things.
  // General India is the fifth stripe on the masthead and a figure the Center
  // shows people; a festival in Peru sitting in it would make that untrue.
  it('proposes General India when a stream could not be established', () => {
    expect(communityOrCatchAll(null, false)).toBe('general_india');
    expect(communityOrCatchAll('', false)).toBe('general_india');
  });

  it('gives no community at all to something outside the archive', () => {
    expect(communityOrCatchAll(null, true)).toBeNull();
  });

  it('proposes General India rather than trusting a stream it does not know', () => {
    expect(communityOrCatchAll('Bene-Israel', false)).toBe('general_india');
    expect(communityOrCatchAll('mumbai', false)).toBe('general_india');
  });

  it('leaves a stream the model did place alone, off-topic or not', () => {
    // If it read Cochin off the material, that reading outranks a judgement
    // made about the item as a whole. The volunteer sees both.
    expect(communityOrCatchAll('baghdadi', false)).toBe('baghdadi');
    expect(communityOrCatchAll('baghdadi', true)).toBe('baghdadi');
  });

  it('is applied after the gate, not asked of the model', () => {
    // Asking a model to always answer teaches it to manufacture the confidence
    // that gets an answer through, which is the one thing the 70% rule exists
    // to stop. So a sub-threshold community is still discarded here; the
    // fallback happens afterwards, in the provider.
    expect(gateSuggestions([read({ key: 'community', value: 'baghdadi', confidence: 0.5 })])).toEqual([]);
  });
});

describe('effectiveConfidence', () => {
  it('leaves a reading alone', () => {
    expect(effectiveConfidence('read', 0.95)).toBeCloseTo(0.95);
  });

  it('caps a guess below the threshold', () => {
    expect(effectiveConfidence('guess', 1)).toBeLessThan(SUGGESTION_THRESHOLD);
  });

  it('caps an inference short of certainty', () => {
    expect(effectiveConfidence('inferred', 1)).toBeLessThan(1);
  });
});

describe('merging several files into one record', () => {
  it('takes each field from whichever page read it best', () => {
    const merged = mergeSuggestions([
      gateSuggestions([read({ key: 'map.geo.markets', value: 'Crawford Market', confidence: 0.8 })]),
      gateSuggestions([
        read({ key: 'map.geo.markets', value: 'Null Bazaar', confidence: 0.94 }),
        read({ key: 'date_on_item', value: '1907', confidence: 0.9 }),
      ]),
    ]);

    expect(merged).toHaveLength(2);
    expect(merged.find((s) => s.key === 'map.geo.markets')?.value).toBe('Null Bazaar');
  });

  it('is unaffected by the order the pages were uploaded in', () => {
    const a = gateSuggestions([read({ confidence: 0.8 })]);
    const b = gateSuggestions([read({ value: 'Bombay, India', confidence: 0.9 })]);
    expect(mergeSuggestions([a, b])).toEqual(mergeSuggestions([b, a]));
  });
});

describe('the evidence ledger', () => {
  it('is derived from what survived, so the two cannot disagree', () => {
    const kept = gateSuggestions([read(), read({ key: 'map.geo.markets', value: 'Null Bazaar', confidence: 0.4 })]);
    const ledger = ledgerFrom(kept)!;

    expect(Object.keys(ledger)).toEqual(['origin_place']);
    expect(ledger.origin_place).toEqual({ basis: 'read', note: 'the imprint reads Calcutta' });
  });

  it('is null when nothing cleared the gate', () => {
    expect(ledgerFrom([])).toBeNull();
  });
});

describe('telling a correction from an addition', () => {
  // Both end up as a person's value. One overrode a reading and the other
  // filled a silence, and only the first is marked — being overruled by the
  // contributor usually makes a value more trustworthy, not less, so the mark
  // must never read as a warning.
  it('marks a value a person changed', () => {
    expect(isCorrected({ key: 'period', value: '1907', suggested: '1890s' })).toBe(true);
  });

  it('does not mark a value left exactly as the machine wrote it', () => {
    expect(isCorrected({ key: 'period', value: '1890s', suggested: '1890s' })).toBe(false);
    expect(isCorrected({ key: 'period', value: '  1890s  ', suggested: '1890s' })).toBe(false);
  });

  it('does not mark a field nobody proposed', () => {
    expect(isCorrected({ key: 'period', value: '1907' })).toBe(false);
    expect(isCorrected({ key: 'period', value: '1907', suggested: null })).toBe(false);
  });

  it('marks a finding a person cleared away', () => {
    // Emptying a field is a correction too: the machine read something and a
    // person says it is not there.
    expect(isCorrected({ key: 'period', value: '', suggested: '1890s' })).toBe(true);
  });
});

describe('the tree itself', () => {
  it('has unique keys', () => {
    expect(new Set(FIELDS.map((f) => f.key)).size).toBe(FIELDS.length);
  });

  it('offers every enum field at least one value it will accept', () => {
    for (const field of FIELDS.filter((f) => f.type === 'enum')) {
      expect(field.options?.length ?? 0).toBeGreaterThan(0);
      for (const option of field.options ?? []) {
        expect(isValidValue(field.key, option.value)).toBe(true);
      }
    }
  });

  it('rejects a value longer than the field allows', () => {
    const field = FIELDS.find((f) => f.type === 'text')!;
    expect(isValidValue(field.key, 'x'.repeat(field.maxLength))).toBe(true);
    expect(isValidValue(field.key, 'x'.repeat(field.maxLength + 1))).toBe(false);
  });
});
