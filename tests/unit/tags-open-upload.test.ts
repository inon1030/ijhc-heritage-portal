// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ actor: vi.fn(), create: vi.fn(), ensure: vi.fn() }));
vi.mock('next/server', async original => ({ ...await original<typeof import('next/server')>(), after: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getCurrentVolunteer: mocks.actor }));
vi.mock('@/lib/items/mutations', () => ({ createItem: mocks.create }));
vi.mock('@/lib/vocabulary/mutations', () => ({ ensureKeywords: mocks.ensure }));
vi.mock('@/lib/files/grant', () => ({ verifyGrant: () => true }));
vi.mock('@/lib/items/receipt', () => ({ receiptFor: () => 'test-receipt' }));
vi.mock('@/lib/i18n', () => ({ getMessages: async () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/rate-limit', () => ({ clientKey: () => 'test', rateLimit: () => ({ allowed: true }) }));
vi.mock('@/lib/problems/record', () => ({ recordProblem: vi.fn() }));
import { POST } from '@/app/api/items/route';
const keywords = Array.from({ length: 30 }, (_, i) => `Tag ${i}`);
const request = (extra = {}) => new NextRequest('https://example.test/api/items', { method: 'POST', body: JSON.stringify({
  title: 'Record', consentVersion: 'test', contributorKeywords: ['Mumbai'], suggestedKeywords: keywords,
  files: [{ path: 'test.png', grant: 'grant', expiresAt: 1000, fileName: 'test.png', mimeType: 'image/png', byteSize: 123, analysis: null }], ...extra,
}) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ id: 'new-item', title: 'Record' });
  mocks.ensure.mockResolvedValue(['Mumbai', ...keywords]);
});
it('keeps all contributor proposals without granting vocabulary writes', async () => {
  expect((await POST(request())).status).toBe(201);
  expect(mocks.ensure).not.toHaveBeenCalled();
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ suggestedKeywords: keywords, contributorKeywords: ['Mumbai'], uploadedBy: null }));
});
it.each(['volunteer', 'admin'])('creates selected upload terms for %s without publishing the item', async role => {
  mocks.actor.mockResolvedValue({ id: 'expert', role });
  expect((await POST(request())).status).toBe(201);
  expect(mocks.ensure).toHaveBeenCalledWith(['Mumbai', ...keywords]);
  const payload = mocks.create.mock.calls[0][0];
  expect(payload).toMatchObject({ suggestedKeywords: [], contributorKeywords: ['Mumbai', ...keywords], uploadedBy: 'expert' });
  expect(payload).not.toHaveProperty('keywords');
  expect(payload).not.toHaveProperty('status');
});
it('rejects an overlong proposal before any write', async () => {
  expect((await POST(request({ suggestedKeywords: ['x'.repeat(81)] }))).status).toBe(400);
  expect(mocks.ensure).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
