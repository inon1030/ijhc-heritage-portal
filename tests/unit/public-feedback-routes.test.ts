import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { publicToken } from '@/lib/items/public-tokens';
import { __resetRateLimit } from '@/lib/rate-limit';
const mocks = vi.hoisted(() => ({
  create: vi.fn(async () => true), moderate: vi.fn(async () => true),
  decide: vi.fn(async () => true), object: vi.fn(async () => true),
  expert: vi.fn(async (): Promise<unknown> => null),
  item: vi.fn(async (): Promise<unknown> => ({
    id: '12345678-1234-4234-8234-123456789abc', category: 'documents', title: 'Title', description: null,
    period: null, origin_place: null, fields: [],
  })),
}));
vi.mock('next/server', async importOriginal => ({ ...await importOriginal<typeof import('next/server')>(), after: vi.fn() }));
vi.mock('@/lib/i18n', () => ({ getMessages: async () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/items/queries', () => ({ getPublishedItem: mocks.item }));
vi.mock('@/lib/items/mutations', () => ({
  createPublicFeedback: mocks.create, moderateRecordComment: mocks.moderate, saveCollector: vi.fn(),
  decideRecordCorrection: mocks.decide, objectToCorrection: mocks.object,
}));
vi.mock('@/lib/supabase/server', () => ({ getCurrentVolunteer: mocks.expert }));
vi.mock('@/lib/mail/record-feedback', () => ({ notifyRecordFeedback: vi.fn() }));
import { POST as feedback } from '@/app/api/records/[id]/feedback/route';
import { POST as moderation } from '@/app/api/records/[id]/moderation/route';
import { POST as decision } from '@/app/api/corrections/[id]/decision/route';

const id = '12345678-1234-4234-8234-123456789abc';
const params = { params: Promise.resolve({ id }) };
const request = (body: unknown, ip = '192.0.2.1') => new NextRequest('https://example.org/api/records/' + id + '/feedback', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body),
});
const valid = () => ({ token: publicToken('form', id, Date.now() - 4000), anonymous: true, body: 'Comment', website: '' });
beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-public-route-secret';
  vi.clearAllMocks(); __resetRateLimit(); mocks.expert.mockResolvedValue(null);
});
it('publishes a comment with no contact details in its response', async () => {
  const response = await feedback(request({ ...valid(), anonymous: false, name: 'Test reader', email: 'private@example.org' }), params);
  expect(response.status).toBe(201);
  expect(await response.text()).not.toContain('private@example.org');
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'comment', email: 'private@example.org' }));
});
it('rejects honeypots, forged timestamps and three links before writing', async () => {
  for (const body of [{ ...valid(), website: 'spam' }, { ...valid(), token: 'forged' },
    { ...valid(), body: 'https://a.test https://b.test https://c.test' }, { ...valid(), body: 'x'.repeat(2001) }]) {
    expect((await feedback(request(body), params)).status).toBe(400);
  }
  expect(mocks.create).not.toHaveBeenCalled();
});
it('limits repeated submissions by IP', async () => {
  for (let i = 0; i < 6; i++) expect((await feedback(request(valid()), params)).status).toBe(201);
  expect((await feedback(request(valid()), params)).status).toBe(429);
  expect(mocks.create).toHaveBeenCalledTimes(6);
});
it('also limits one record across different IP addresses', async () => {
  for (let i = 0; i < 30; i++) expect((await feedback(request(valid(), `192.0.2.${i + 1}`), params)).status).toBe(201);
  expect((await feedback(request(valid(), '192.0.2.100'), params)).status).toBe(429);
});
it('does not accept feedback on a record that is no longer public', async () => {
  mocks.item.mockResolvedValueOnce(null);
  expect((await feedback(request(valid()), params)).status).toBe(404);
  expect(mocks.create).not.toHaveBeenCalled();
});
it('queues a diff without calling the expert mutation', async () => {
  const response = await feedback(request({ ...valid(), values: { title: 'Revised' }, originals: { title: 'Title' } }), params);
  expect(response.status).toBe(201);
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'correction', changes: { title: { from: 'Title', to: 'Revised' } }, objectionToken: expect.any(String),
  }));
  expect(mocks.decide).not.toHaveBeenCalled();
});
it('rejects protected fields and stale originals', async () => {
  expect((await feedback(request({ ...valid(), values: { title: 'Revised' }, originals: { title: 'Old' } }), params)).status).toBe(400);
  expect((await feedback(request({ ...valid(), values: { access: 'public' }, originals: { access: 'restricted' } }), params)).status).toBe(400);
  expect(mocks.create).not.toHaveBeenCalled();
});
it('requires an expert for comment moderation and correction decisions', async () => {
  expect((await moderation(request({ commentId: id, hidden: true }), params)).status).toBe(403);
  expect((await decision(request({ accept: true, objectionAt: null }), params)).status).toBe(403);
  expect(mocks.moderate).not.toHaveBeenCalled();
  expect(mocks.decide).not.toHaveBeenCalled();
});
it('passes the objection version to the atomic decision and reports a race as conflict', async () => {
  mocks.expert.mockResolvedValue({ id: 'expert' });
  mocks.decide.mockResolvedValueOnce(false);
  const objectionAt = '2026-10-20T12:00:00.000+00:00';
  expect((await decision(request({ accept: true, objectionAt }), params)).status).toBe(409);
  expect(mocks.decide).toHaveBeenCalledWith(id, true, objectionAt);
});
