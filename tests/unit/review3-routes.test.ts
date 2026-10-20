// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({
  actor: vi.fn(), item: vi.fn(), review: vi.fn(), bin: vi.fn(), saveDraft: vi.fn(),
  draft: vi.fn(), discard: vi.fn(), candidates: vi.fn(), decide: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ getCurrentVolunteer: mocks.actor }));
vi.mock('@/lib/items/queries', () => ({ getItemDetail: mocks.item, readReviewDraft: mocks.draft, readReviewCandidates: mocks.candidates }));
vi.mock('@/lib/items/mutations', () => ({ reviewItem: mocks.review, binItem: mocks.bin, saveReviewDraft: mocks.saveDraft, discardReviewDraft: mocks.discard, decideReviewCandidate: mocks.decide }));
vi.mock('@/lib/vocabulary/load', () => ({ readVocabulary: async () => [] }));
vi.mock('@/lib/vocabulary/queries', () => ({ listItemFamilyIds: async () => [] }));
vi.mock('@/lib/i18n', () => ({ getMessages: async () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/problems/record', () => ({ recordProblem: vi.fn() }));
const single = await import('@/app/api/items/[id]/review/route');
const drafts = await import('@/app/api/items/[id]/draft/route');
const batch = await import('@/app/api/items/bulk-review/route');
const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ id }) };
const review = { status: 'accepted', title: 'Record', category: 'documents', description: null, community: null, provenance: null, keywords: [], language: null, period: null, originPlace: null, access: 'public', fields: [] };
function request(body: unknown) { return new NextRequest('https://example.test/api/items/bulk-review', { method: 'POST', body: JSON.stringify(body) }); }
beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ id: 'expert', role: 'volunteer' });
  mocks.item.mockResolvedValue({ id, status: 'accepted', uploaded_by: null, reviewed_by: 'other', deleted_at: null });
});
describe('three review entry points', () => {
  it('returns translated 403 before any write on another expert’s published record', async () => {
    for (const handler of [single.POST, single.DELETE, drafts.PUT]) {
      const response = await handler(request(review), context);
      expect(response.status).toBe(403);
      expect((await response.json()).error.message).toBe('review3.readOnly');
    }
    expect(mocks.review).not.toHaveBeenCalled();
    expect(mocks.bin).not.toHaveBeenCalled();
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });
  it.each(['uploaded_by', 'reviewed_by'])('allows ownership through %s to reach existing validation', async field => {
    mocks.item.mockResolvedValue({ status: 'accepted', reviewed_by: null, [field]: 'expert' });
    const response = await single.POST(request({ ...review, category: null }), context);
    expect(response.status).toBe(400);
    expect(mocks.review).not.toHaveBeenCalled();
  });
  it('rejects anonymous batches before reading records', async () => {
    mocks.actor.mockResolvedValue(null);
    expect((await batch.POST(request({ items: [] }))).status).toBe(401);
    expect(mocks.item).not.toHaveBeenCalled();
  });
  it('rejects oversized and duplicate batches', async () => {
    for (const items of [Array.from({ length: 51 }, () => ({ id, review })), [{ id, review }, { id, review }]]) {
      expect((await batch.POST(request({ items }))).status).toBe(400);
    }
    expect(mocks.review).not.toHaveBeenCalled();
  });
  it('isolates per-item failures and reuses category validation', async () => {
    mocks.item.mockResolvedValue({ status: 'pending', reviewed_by: null });
    mocks.review.mockResolvedValue({ ok: false, code: 'invalid_transition', message: 'changed' });
    const response = await batch.POST(request({ items: [{ id, review: { ...review, category: null } }, { id: other, review }] }));
    const body = await response.json();
    expect(body.data.results.map((result: { status: number }) => result.status)).toEqual([400, 409]);
    expect(mocks.review).toHaveBeenCalledTimes(1);
    expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({ itemId: other, category: 'documents', status: 'accepted' }));
  });
});
