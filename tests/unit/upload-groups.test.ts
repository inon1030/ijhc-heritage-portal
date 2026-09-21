import { describe, expect, it } from 'vitest';
import { groupFiles, looseCount } from '@/lib/upload/groups';

/**
 * Which files become which records. The contributor decides, in two ways: the
 * old question for ordinary files, and "another page / a separate document"
 * while scanning. A mistake here merges two families' letters into one record,
 * or splits one letter's pages across three.
 */
describe('grouping files into records', () => {
  it('keeps the old behaviour when nothing was scanned', () => {
    const files = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(groupFiles(files, 'one')).toEqual([['a', 'b', 'c']]);
    expect(groupFiles(files, 'separate')).toEqual([['a'], ['b'], ['c']]);
  });

  it('makes one record per scanned document, pages in the order taken', () => {
    const files = [
      { id: 'p1', doc: 'd1' },
      { id: 'p2', doc: 'd1' },
      { id: 'q1', doc: 'd2' },
      { id: 'p3', doc: 'd1' },
    ];
    expect(groupFiles(files, 'one')).toEqual([['p1', 'p2', 'p3'], ['q1']]);
    // The question about ordinary files does not touch scanned documents.
    expect(groupFiles(files, 'separate')).toEqual([['p1', 'p2', 'p3'], ['q1']]);
  });

  it('lets ordinary files follow the question beside scanned documents', () => {
    const files = [{ id: 'a' }, { id: 's1', doc: 'd1' }, { id: 'b' }, { id: 's2', doc: 'd1' }];
    expect(groupFiles(files, 'one')).toEqual([['a', 'b'], ['s1', 's2']]);
    expect(groupFiles(files, 'separate')).toEqual([['a'], ['b'], ['s1', 's2']]);
  });

  it('counts only ordinary files for the question', () => {
    expect(looseCount([{ id: 'a' }, { id: 's', doc: 'd' }])).toBe(1);
  });

  it('returns nothing for nothing', () => {
    expect(groupFiles([], 'one')).toEqual([]);
  });
});
