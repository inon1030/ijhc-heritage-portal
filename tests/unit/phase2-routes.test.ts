// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const getCurrentVolunteer = vi.fn();
const resolveDuplicate = vi.fn();
const retryItemReading = vi.fn();
const retryOneReading = vi.fn();
const readDuplicates = vi.fn();
const readRetryState = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ getCurrentVolunteer }));
vi.mock('@/lib/items/mutations', () => ({ resolveDuplicate, retryItemReading }));
vi.mock('@/lib/items/queries', () => ({ readDuplicates, readRetryState, getItemDetail: async () => ({status:'pending',reviewed_by:null,deleted_at:null}) }));
vi.mock('@/lib/items/retry-reading', () => ({ retryOneReading }));
vi.mock('@/lib/i18n', () => ({ getMessages: async () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/problems/record', () => ({ recordProblem: vi.fn() }));
const duplicates = await import('@/app/api/items/[id]/duplicates/route');
const reread = await import('@/app/api/items/[id]/reread/route');
const cron = await import('@/app/api/cron/reread/route');
const id = '11111111-1111-4111-8111-111111111111';
const pairId = '22222222-2222-4222-8222-222222222222';
const ctx = { params: Promise.resolve({ id }) };
const request = (body: unknown = {}) => new Request('https://archive.example/api/items/x/duplicates', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); getCurrentVolunteer.mockResolvedValue(null); readDuplicates.mockResolvedValue([]); });
describe('expert routes', () => {
  it('denies anonymous and pending visitors before reading or writing', async () => {
    for (const route of [duplicates, reread]) {
      expect((await route.GET(request(), ctx)).status).toBe(403);
      expect((await route.POST(request(), ctx)).status).toBe(403);
    }
    expect(resolveDuplicate).not.toHaveBeenCalled();
    expect(retryItemReading).not.toHaveBeenCalled();
    expect(readDuplicates).not.toHaveBeenCalled();
  });
  it('validates the pair and binds it to the authenticated actor and path', async () => {
    getCurrentVolunteer.mockResolvedValue({ id: 'expert', role: 'volunteer' });
    resolveDuplicate.mockResolvedValue('older');
    expect((await duplicates.POST(request({ pairId, resolution: 'merged', actorId: 'forged' }), ctx)).status).toBe(200);
    expect(resolveDuplicate).toHaveBeenCalledWith(id, pairId, 'expert', 'merged');
  });
  it('refuses a malformed item id before interpolating a PostgREST OR expression', async () => {
    getCurrentVolunteer.mockResolvedValue({ id: 'expert', role: 'volunteer' });
    expect((await duplicates.GET(request(), { params: Promise.resolve({ id: 'x,other_item_id.neq.null' }) })).status).toBe(400);
    expect(readDuplicates).not.toHaveBeenCalled();
  });
  it('reports merge races and unavailable retries as conflicts', async () => {
    getCurrentVolunteer.mockResolvedValue({ id: 'expert', role: 'volunteer' });
    resolveDuplicate.mockRejectedValue(new Error('already resolved'));
    expect((await duplicates.POST(request({ pairId, resolution: 'merged' }), ctx)).status).toBe(409);
    retryItemReading.mockResolvedValue(false);
    expect((await reread.POST(request(), ctx)).status).toBe(409);
  });
});
describe('daily scheduler', () => {
  it('rejects missing or wrong credentials without reading the queue', async () => {
    vi.stubEnv('CRON_SECRET', 'test-only');
    expect((await cron.GET(new Request('https://archive.example'))).status).toBe(401);
    expect(retryOneReading).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
  it('does nothing on a deployment that is not the cron home', async () => {
    vi.stubEnv('CRON_SECRET', 'test-only');
    vi.stubEnv('CRON_HOME', '');
    const response = await cron.GET(new Request('https://archive.example', { headers: { authorization: 'Bearer test-only' } }));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ skipped: 'not the cron home' });
    expect(retryOneReading).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
  it('limits the run to the configured number of reading claims', async () => {
    vi.stubEnv('CRON_SECRET', 'test-only');
    vi.stubEnv('CRON_HOME', '1');
    vi.stubEnv('AI_RETRY_DAILY', '2');
    retryOneReading.mockResolvedValue(true);
    const response = await cron.GET(new Request('https://archive.example', { headers: { authorization: 'Bearer test-only' } }));
    expect((await response.json()).data).toEqual({ attempted: 2, limit: 2 });
    expect(retryOneReading).toHaveBeenCalledTimes(2);
    vi.unstubAllEnvs();
  });
});
