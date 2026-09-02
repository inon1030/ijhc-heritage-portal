import { describe, expect, it } from 'vitest';
import {
  buildVocabulary,
  byBranch,
  isKnown,
  resolveTerms,
  termsFor,
  unplaced,
} from '@/lib/vocabulary/thesaurus';
import type { Keyword } from '@/lib/types';

/**
 * The thesaurus.
 *
 * These are the rules that stop the vocabulary drifting: one preferred
 * spelling per idea, every term hung on a branch of the tree, and nothing
 * reaching a record that the archive does not hold. The live data is what made
 * them necessary — `Bombay` and `Mumbai` were two separate terms, and eight
 * analysed files had queued thirty-six loose candidates.
 */

let n = 0;
const row = (over: Partial<Keyword> = {}): Keyword => ({
  id: `k${++n}`,
  term: 'Term',
  community: null,
  branch_key: 'domain.lifestyle.traditions',
  preferred_id: null,
  external_id: null,
  created_by: null,
  created_at: '2026-09-02T00:00:00Z',
  ...over,
});

describe('a term has one spelling the archive stores', () => {
  it('nests variants under the term they belong to', () => {
    const mumbai = row({ id: 'm', term: 'Mumbai', branch_key: 'map.geo.cities_villages' });
    const bombay = row({ id: 'b', term: 'Bombay', preferred_id: 'm' });

    const vocab = buildVocabulary([mumbai, bombay]);

    expect(vocab).toHaveLength(1);
    expect(vocab[0].term).toBe('Mumbai');
    expect(vocab[0].variants).toEqual(['Bombay']);
  });

  it('resolves a variant to the preferred spelling', () => {
    const vocab = buildVocabulary([
      row({ id: 'm', term: 'Mumbai' }),
      row({ id: 'b', term: 'Bombay', preferred_id: 'm' }),
    ]);

    expect(resolveTerms(vocab, ['Bombay'])).toEqual(['Mumbai']);
  });

  it('does not write the same term twice when both spellings are chosen', () => {
    // The case that would otherwise put "Mumbai, Mumbai" on a record: a
    // reviewer ticks the term and a stale suggestion supplies the variant.
    const vocab = buildVocabulary([
      row({ id: 'm', term: 'Mumbai' }),
      row({ id: 'b', term: 'Bombay', preferred_id: 'm' }),
    ]);

    expect(resolveTerms(vocab, ['Mumbai', 'Bombay'])).toEqual(['Mumbai']);
  });

  it('matches whatever case and spacing a person typed', () => {
    const vocab = buildVocabulary([row({ id: 'm', term: 'Mumbai' })]);
    expect(resolveTerms(vocab, ['  mumbai '])).toEqual(['Mumbai']);
  });

  it('drops a word the vocabulary does not hold', () => {
    // The vocabulary being closed has to be true at the endpoint, not only in
    // the screen that offers the list.
    const vocab = buildVocabulary([row({ id: 'm', term: 'Mumbai' })]);
    expect(resolveTerms(vocab, ['Mumbai', 'Atlantis'])).toEqual(['Mumbai']);
  });

  it('keeps a variant whose term has gone missing rather than losing the word', () => {
    const orphan = row({ id: 'x', term: 'Bombaim', preferred_id: 'vanished' });
    const vocab = buildVocabulary([orphan]);

    expect(vocab).toHaveLength(1);
    expect(vocab[0].term).toBe('Bombaim');
  });

  it('knows a word under any of its spellings', () => {
    const vocab = buildVocabulary([
      row({ id: 'm', term: 'Mumbai' }),
      row({ id: 'b', term: 'Bombay', preferred_id: 'm' }),
    ]);

    expect(isKnown(vocab, 'bombay')).toBe(true);
    expect(isKnown(vocab, 'MUMBAI')).toBe(true);
    expect(isKnown(vocab, 'Atlantis')).toBe(false);
  });
});

describe('a term hangs off a branch of the tree', () => {
  it('groups terms under their branch, with the catalogue named', () => {
    const branches = byBranch(
      buildVocabulary([
        row({ term: 'Alibag', branch_key: 'map.geo.cities_villages' }),
        row({ term: 'Purim', branch_key: 'domain.lifestyle.traditions' }),
      ]),
    );

    const geo = branches.find((b) => b.branchKey === 'map.geo.cities_villages')!;
    expect(geo.label).toBe('Cities and Villages');
    expect(geo.catalogue).toBe('Communities Mapping');
    expect(geo.terms.map((t) => t.term)).toEqual(['Alibag']);
  });

  it('shows no empty branches', () => {
    // Forty-one branches exist. Listing the forty with nothing in them would
    // bury the one that has something.
    const branches = byBranch(buildVocabulary([row({ term: 'Purim' })]));
    expect(branches).toHaveLength(1);
  });

  it('keeps a term whose branch the registry no longer defines', () => {
    const branches = byBranch(buildVocabulary([row({ term: 'Orphan', branch_key: 'gone.away' })]));
    expect(branches[0].label).toBe('gone.away');
    expect(branches[0].catalogue).toBe('No longer in the tree');
  });

  it('lists the terms nobody has placed yet', () => {
    const vocab = buildVocabulary([
      row({ term: 'Architecture', branch_key: null }),
      row({ term: 'Purim' }),
    ]);

    expect(unplaced(vocab).map((t) => t.term)).toEqual(['Architecture']);
  });
});

describe('a term scoped to one community is not offered to another', () => {
  it('offers global terms everywhere and scoped terms only in their stream', () => {
    const vocab = buildVocabulary([
      row({ term: 'Synagogue', community: null }),
      row({ term: 'Paradesi', community: 'cochin' }),
      row({ term: 'Baghdadi rite', community: 'baghdadi' }),
    ]);

    expect(termsFor(vocab, 'cochin').map((t) => t.term).sort()).toEqual(['Paradesi', 'Synagogue']);
    expect(termsFor(vocab, null).map((t) => t.term)).toEqual(['Synagogue']);
  });
});
