// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const afterJobs: (() => Promise<void>)[] = [];
vi.mock('next/server', async (original) => ({ ...await original<typeof import('next/server')>(), after: (job: () => Promise<void>) => afterJobs.push(job) }));
const generateLink = vi.fn();
const verifyOtp = vi.fn();
const updateUser = vi.fn();
const sendMail = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabase: () => ({ auth: { admin: { generateLink } } }) }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: async () => ({ auth: { verifyOtp, updateUser } }) }));
vi.mock('@/lib/mail', () => ({ sendMail }));
vi.mock('@/lib/problems/record', () => ({ recordProblem: vi.fn() }));
vi.mock('@/lib/site', () => ({ siteUrl: () => 'https://archive.example' }));
vi.mock('@/lib/i18n', async () => {
  const { en } = await import('@/lib/i18n/messages');
  const { default: he } = await import('@/lib/i18n/locales/he.json');
  const resolve = (language: string) => language === 'he' ? { ...en, ...he } : en;
  const reader = (catalogue: Record<string, string>) => (key: string) => catalogue[key];
  return { resolve, reader, getMessages: async () => ({ t: reader(resolve('he')), language: { code: 'he' } }) };
});
const { POST: forgot } = await import('@/app/api/auth/forgot/route');
const { POST: reset } = await import('@/app/api/auth/reset/route');
let serial = 0;
const request = (body: unknown, ip = `ip-${serial++}`) => new Request('https://archive.example/api/auth/forgot', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body),
});
beforeEach(() => {
  afterJobs.length = 0;
  vi.clearAllMocks();
  generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'a'.repeat(64) } }, error: null });
  verifyOtp.mockResolvedValue({ data: { user: { id: 'pending-account' } }, error: null });
  updateUser.mockResolvedValue({ error: null });
  sendMail.mockResolvedValue(true);
});
describe('neutral recovery mail', () => {
  it('returns before account lookup and sends our Hebrew email using a fixed origin', async () => {
    const response = await forgot(request({ email: 'existing@example.org' }));
    expect(response.status).toBe(200);
    expect(generateLink).not.toHaveBeenCalled();
    await afterJobs[0]();
    expect(generateLink).toHaveBeenCalledWith({ type: 'recovery', email: 'existing@example.org', options: { redirectTo: 'https://archive.example/login/reset' } });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'existing@example.org', html: expect.stringContaining('dir="rtl"'),
      text: expect.stringContaining('https://archive.example/login/reset?token_hash='),
    }));
  });
  it('has the same response for missing, malformed, and rate-limited addresses', async () => {
    const responses: unknown[] = [];
    for (let n = 0; n < 5; n++) responses.push(await (await forgot(request({ email: 'limited@example.org' }))).json());
    responses.push(await (await forgot(request({ email: 'bad' }))).json());
    expect(responses.every((r) => JSON.stringify(r) === JSON.stringify(responses[0]))).toBe(true);
    expect(afterJobs).toHaveLength(3);
    generateLink.mockResolvedValue({ data: null, error: { message: 'missing account' } });
    for (const job of afterJobs) await job();
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('applies the IP limit even when each address differs', async () => {
    for (let n = 0; n < 12; n++) await forgot(request({ email: `person-${n}@example.org` }, 'one-ip'));
    expect(afterJobs).toHaveLength(10);
  });
});
describe('recovery redemption', () => {
  const body = { tokenHash: 'a'.repeat(64), password: 'new-password-123', confirmation: 'new-password-123' };
  it('verifies recovery and keeps the pending account session without changing profiles', async () => {
    expect((await reset(request(body))).status).toBe(200);
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: body.tokenHash, type: 'recovery' });
    expect(updateUser).toHaveBeenCalledWith({ password: body.password });
  });
  it('rejects mismatch before consuming a single-use link', async () => {
    expect((await reset(request({ ...body, confirmation: 'different-password' }))).status).toBe(400);
    expect(verifyOtp).not.toHaveBeenCalled();
  });
  it('never changes the password for an expired token', async () => {
    verifyOtp.mockResolvedValue({ data: {}, error: { message: 'expired' } });
    const response = await reset(request(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('expired_link');
    expect(updateUser).not.toHaveBeenCalled();
  });
  it('gives malformed tokens the request-new-link state', async () => {
    const response = await reset(request({ ...body, tokenHash: '<script>' }));
    expect((await response.json()).error.code).toBe('expired_link');
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
