// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(), admin: vi.fn(), vocabulary: vi.fn(), insert: vi.fn(), insertError: vi.fn(), update: vi.fn(), review: vi.fn(),
  candidates: [] as { id: string; term: string }[],
  item: vi.fn(),
}));
vi.mock('next/server', async original => ({ ...await original<typeof import('next/server')>(), after: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/i18n', () => ({ getMessages: async () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/problems/record', () => ({ recordProblem: vi.fn() }));
vi.mock('@/lib/vocabulary/load', () => ({ readVocabulary: mocks.vocabulary }));
vi.mock('@/lib/items/queries', () => ({ getItemDetail: mocks.item }));
vi.mock('@/lib/items/mutations', () => ({ reviewItem: mocks.review }));
vi.mock('@/lib/supabase/server', () => ({
  getCurrentVolunteer: mocks.actor, getCurrentAdmin: mocks.admin,
  createServerSupabase: async () => ({ from: (table: string) => {
    const chain = {
      select: () => chain, eq: () => chain, order: () => chain,
      range: async (start: number, end: number) => ({ data: mocks.candidates.slice(start, end + 1), error: null }),
      insert: (value: unknown) => { mocks.insert(table, value); return chain; },
      single: async () => {
        const value = mocks.insert.mock.calls.at(-1)?.[1];
        return { data: { id: 'created', ...value }, error: mocks.insertError() ?? null };
      },
      update: (value: unknown) => { mocks.update(table, value); return chain; },
      in: (_key: string, ids: string[]) => { mocks.update('ids', ids); return chain; },
      then: (resolve: (value: unknown) => void) => resolve({ error: null }),
    };
    return chain;
  } }),
}));
import { ensureKeywords, addKeyword } from '@/lib/vocabulary/mutations';
import { POST as bulk } from '@/app/api/items/bulk-review/route';
import { POST as create, DELETE as remove } from '@/app/api/manage/keywords/route';

const id = '11111111-1111-4111-8111-111111111111';
const body = { title: 'Record', category: 'documents', description: null, community: null, provenance: null,
  keywords: ['new tag'], language: null, period: null, originPlace: null, access: 'public', fields: [] };
const request = (body: unknown) => new NextRequest('https://example.test/api', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.insertError.mockReset();
  mocks.actor.mockResolvedValue({ id: 'expert', role: 'volunteer' });
  mocks.admin.mockResolvedValue(null);
  mocks.item.mockResolvedValue({ status: 'pending', reviewed_by: null });
  mocks.vocabulary.mockImplementation(async () => [{ id: 'mumbai', term: 'Mumbai', variants: ['Bombay', 'מומבאי'], community: null, branchKey: null, externalId: null }]);
  mocks.candidates = [];
  mocks.review.mockResolvedValue({ ok: true, from: 'accepted', item: { id, title: 'Record', status: 'accepted', access: 'public' } });
});
it('resolves translations and variants before insertion, accepting matching open candidates', async () => {
  mocks.candidates = [{ id: 'candidate', term: ' BOMBAY ' }, { id: 'unrelated', term: 'Elsewhere' }];
  expect(await ensureKeywords(['מומבאי', ' mumbai ', 'New tag', 'new TAG'])).toEqual(['Mumbai', 'New tag']);
  expect(mocks.insert).toHaveBeenCalledExactlyOnceWith('keywords', { term: 'New tag', community: null, branch_key: null });
  expect(mocks.update).toHaveBeenCalledWith('ids', ['candidate']);
});
it('uses the same duplicate resolution for vocabulary management', async () => {
  expect((await addKeyword(' BOMBAY ', 'cochin')).term).toBe('Mumbai');
  expect(mocks.insert).not.toHaveBeenCalled();
});
it('accepts matching candidates beyond the first database page', async () => {
  mocks.candidates = Array.from({ length: 501 }, (_, i) => ({ id: `candidate-${i}`, term: i === 500 ? 'BOMBAY' : 'unrelated' }));
  await ensureKeywords(['Mumbai']);
  expect(mocks.update).toHaveBeenCalledWith('ids', ['candidate-500']);
});
it('recovers a concurrent insert conflict by attaching the winning term', async () => {
  mocks.vocabulary.mockResolvedValueOnce([]);
  mocks.insertError.mockReturnValue({ code: '23505' });
  expect(await ensureKeywords(['Mumbai'])).toEqual(['Mumbai']);
  expect(mocks.vocabulary).toHaveBeenCalledTimes(2);
});
it('bulk approval creates and attaches a tag without any candidate', async () => {
  const response = await bulk(request({ items: [{ id, review: body }] }));
  expect((await response.json()).data.results[0].ok).toBe(true);
  expect(mocks.insert).toHaveBeenCalledWith('keywords', expect.objectContaining({ term: 'new tag' }));
  expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({ keywords: ['new tag'] }));
});
it('does not create unselected suggestions and allows more than twenty checked tags', async () => {
  const keywords = Array.from({ length: 25 }, (_, i) => `Tag ${i}`);
  mocks.candidates = [{ id: 'unselected', term: 'Do not create me' }];
  await bulk(request({ items: [{ id, review: { ...body, keywords } }] }));
  expect(mocks.insert).toHaveBeenCalledTimes(25);
  expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({ keywords }));
  expect(mocks.update).not.toHaveBeenCalled();
});
it.each([null, 'pending'])('refuses create/attach for an unapproved caller (%s)', async () => {
  // getCurrentVolunteer returns null for both anonymous and pending profiles.
  mocks.actor.mockResolvedValue(null);
  expect((await create(request({ term: 'New', community: null }))).status).toBe(401);
  expect((await bulk(request({ items: [{ id, review: body }] }))).status).toBe(401);
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.review).not.toHaveBeenCalled();
});
it('validates length before writing and preserves admin-only deletion', async () => {
  expect((await create(request({ term: 'x'.repeat(81), community: null }))).status).toBe(400);
  expect((await remove(new NextRequest(`https://example.test/api?id=${id}`, { method: 'DELETE' }))).status).toBe(403);
  expect(mocks.insert).not.toHaveBeenCalled();
});
it('does not create tags for a published record the expert may not edit', async () => {
  mocks.item.mockResolvedValue({ status: 'accepted', uploaded_by: 'someone-else', reviewed_by: 'someone-else' });
  const response = await bulk(request({ items: [{ id, review: body }] }));
  expect((await response.json()).data.results[0].status).toBe(403);
  expect(mocks.insert).not.toHaveBeenCalled();
});
