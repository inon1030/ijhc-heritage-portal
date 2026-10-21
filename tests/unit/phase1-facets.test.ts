import { describe, expect, it } from 'vitest';
import { discreteField, pagination, hasPortalFilters, facetOptions, facetValues, fieldValue, intersectIds, matchesFacets, portalHref, searchWords, validDay, type FacetRow } from '@/lib/items/portal-facets';
import { needsCategory, readingState, reviewOrder, waitingDays } from '@/lib/items/review-order';

const row = (overrides: Partial<FacetRow> = {}): FacetRow => ({ id: 'a', created_at: '2026-01-01', reviewed_at: '2026-02-01T22:30:00Z', category: 'documents', community: 'cochin', keywords: ['Mumbai'], period: '1900s', origin_place: 'India', language: 'Hebrew', item_fields: [], item_files: [{ mime_type: 'image/jpeg' }], item_families: [{ families: { id: 'family', name: 'Ezra' } }], ...overrides });

describe('combined archive facets', () => {
  it('ANDs independent choices including keyword, family and language', () => {
    expect(matchesFacets(row(), { keyword: 'Mumbai', family: 'family', language: 'Hebrew', origin: 'India', period: '1900s', kind: 'photograph' })).toBe(true);
    expect(matchesFacets(row(), { keyword: 'Mumbai', family: 'other' })).toBe(false);
  });
  it('counts distinct records rather than multiple files or duplicate values', () => {
    const options = facetOptions([row({ item_files: [{ mime_type: 'image/jpeg' }, { mime_type: 'image/png' }], keywords: ['Mumbai','Mumbai'] })]);
    expect(options.kind[0].count).toBe(1);
    expect(options.keyword[0].count).toBe(1);
  });
  it('offers only values compatible with all OTHER active facets', () => {
    const options = facetOptions([row(), row({ id: 'b', language: 'Marathi', period: '1800s' })], { language: 'Hebrew', period: '1900s' });
    expect(options.period.map(o => o.value)).toEqual(['1900s']);
    expect(options.language.map(o => o.value)).toEqual(['Hebrew']);
  });
  it('keeps the last day inclusive and excludes missing publication dates', () => {
    expect(matchesFacets(row(), { from: '2026-02-01', to: '2026-02-01' })).toBe(true);
    expect(matchesFacets(row({ reviewed_at: null }), { from: '2026-02-01' })).toBe(false);
    expect(matchesFacets(row(), { from: '2026-03-01', to: '2026-01-01' })).toBe(false);
  });
  it('rejects invalid calendar dates without crashing on hand-written URLs', () => {
    expect(validDay('2026-02-30')).toBeUndefined();
    expect(validDay('yesterday')).toBeUndefined();
    expect(validDay('2024-02-29')).toBe('2024-02-29');
  });
  it('only links discrete registry values, never notes or exact dates', () => {
    expect(discreteField('domain.life.marriage')).toBe(true);
    for (const key of ['inscription','date_on_item','condition','unknown','period']) expect(discreteField(key)).toBe(false);
    const fields = facetValues(row({ item_fields: [{ field_key: 'domain.life.marriage', value: 'Marriage' }, { field_key: 'inscription', value: 'a note' }] }), 'field');
    expect(fields).toEqual([{ value: fieldValue('domain.life.marriage','Marriage'), label: 'Marriage' }]);
    expect(matchesFacets(row({ item_fields: [{ field_key: 'domain.life.marriage', value: 'Marriage' }] }), { field: fields[0].value })).toBe(true);
  });
  it('recognizes all four measured media types', () => {
    expect(facetValues(row({ item_files: ['image/tiff','audio/wav','video/mp4','application/pdf'].map(mime_type => ({ mime_type })) }), 'kind').map(o => o.value)).toEqual(['photograph','audio','video','document']);
  });
  it('encodes Hebrew, punctuation and separators safely in links', () => {
    expect(new URL(portalHref('keyword','כתובה & 50%'),'https://example.test').searchParams.get('keyword')).toBe('כתובה & 50%');
  });
});

describe('word intersections', () => {
  it('normalizes Latin case, whitespace and duplicates without discarding Hebrew', () => expect(searchWords('  Ezra\tכתובה EZRA ')).toEqual(['ezra','כתובה']));
  it('requires every word, allows different sources and deduplicates records', () => expect(intersectIds([['a','b','a'],['b','a'],['a']])).toEqual(['a']));
  it('does not turn a missing word into an unfiltered search', () => expect(intersectIds([['a'],[]])).toEqual([]));
});

describe('review ordering and publication', () => {
  const item = (id: string, created_at: string, status?: 'succeeded' | 'failed' | 'pending') => ({ id, created_at, analysis: status ? { status } : null });
  it('puts successful readings first, oldest first within both groups', () => {
    const rows = [item('failed','2026-01-01','failed'),item('new','2026-03-01','succeeded'),item('old','2026-02-01','succeeded'),item('missing','2026-01-03'),item('pending','2026-01-02','pending')];
    expect(reviewOrder(rows).map(r => r.id)).toEqual(['old','new','failed','pending','missing']);
    expect(rows[0].id).toBe('failed');
  });
  it('provides each distinct unread reason', () => {
    expect(readingState(item('a','','failed'))).toBe('failed');
    expect(readingState(item('a','','pending'))).toBe('pending');
    expect(readingState(item('a',''))).toBe('missing');
  });
  it('treats an item as unread when any of its files failed, even if the first page was read', () => {
    const ruth = { ...item('ruth','2026-01-01','succeeded'), otherReadings: ['failed', 'failed'] as ('failed')[] };
    const fine = { ...item('fine','2026-02-01','succeeded'), otherReadings: ['succeeded'] as ('succeeded')[] };
    expect(readingState(ruth)).toBe('failed');
    expect(readingState(fine)).toBe('ready');
    expect(readingState({ ...item('p','','succeeded'), otherReadings: ['pending'] })).toBe('pending');
    expect(reviewOrder([ruth, fine]).map(r => r.id)).toEqual(['fine','ruth']);
  });
  it('floors elapsed days and handles future or malformed timestamps', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    expect(waitingDays('2026-10-17T13:00:00Z',now)).toBe(2);
    expect(waitingDays('2030-01-01',now)).toBe(0);
    expect(waitingDays('bad',now)).toBe(0);
  });
  it('requires a category only for publication', () => {
    expect(needsCategory('accepted',null)).toBe(true);
    expect(needsCategory('accepted',undefined)).toBe(true);
    expect(needsCategory('accepted','document')).toBe(false);
    expect(needsCategory('pending',null)).toBe(false);
  });
});


it('ignores unknown MIME types rather than inventing a document classification', () => {
  expect(facetValues(row({item_files:[{mime_type:'application/octet-stream'}]}),'kind')).toEqual([]);
});

it('clamps stale, malformed and out-of-range page URLs after filtering', () => {
  expect(pagination(100,'3')).toEqual({page:3,pages:3,offset:96});
  expect(pagination(1,'999')).toEqual({page:1,pages:1,offset:0});
  expect(pagination(0,'-4')).toEqual({page:1,pages:1,offset:0});
  expect(pagination(100,'bad').page).toBe(1);
  expect(pagination(100,'1.5').page).toBe(1);
  expect(hasPortalFilters({query:'  ',from:'invalid'})).toBe(false);
  expect(hasPortalFilters({keyword:'Mumbai'})).toBe(true);
});
