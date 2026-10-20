// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const getCurrentVolunteer = vi.fn();
const getCurrentAdmin = vi.fn();
const createSignedUrl = vi.fn();
let item = { status: 'accepted', access: 'public', deleted_at: null as string | null };
vi.mock('@/lib/supabase/server', () => ({ getCurrentVolunteer, getCurrentAdmin }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabase: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { storage_path: 'original', preview_path: null, mime_type: 'video/mp4', items: item }, error: null }) }) }),
    }),
    storage: { from: () => ({ createSignedUrl }) },
  }),
}));
vi.mock('@/lib/files/rendition', () => ({ makeThumb: vi.fn() }));
vi.mock('@/lib/i18n', () => ({ getMessages: async () => ({ t: (s: string) => s }) }));
vi.mock('@/lib/problems/record', () => ({ recordProblem: vi.fn() }));
const { GET } = await import('@/app/api/files/[fileId]/route');
const context = { params: Promise.resolve({ fileId: 'file' }) };
beforeEach(() => {
  vi.clearAllMocks(); vi.unstubAllGlobals();
  item = { status: 'accepted', access: 'public', deleted_at: null };
  getCurrentVolunteer.mockResolvedValue(null); getCurrentAdmin.mockResolvedValue(null);
  createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage.example/signed' }, error: null });
});
it('serves public bytes inline without a filename and preserves range playback', async () => {
  const fetcher = vi.fn(async () => new Response('segment', { status: 206, headers: {
    'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-6/100', 'Accept-Ranges': 'bytes',
  } }));
  vi.stubGlobal('fetch', fetcher);
  const response = await GET(new NextRequest('https://archive.example/api/files/file', { headers: { Range: 'bytes=0-6' } }), context);
  expect(response.status).toBe(206);
  expect(response.headers.get('content-disposition')).toBe('inline');
  expect(response.headers.get('content-range')).toBe('bytes 0-6/100');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(fetcher).toHaveBeenCalledWith('https://storage.example/signed', expect.objectContaining({ headers: { Range: 'bytes=0-6' } }));
});
it('retains expert access without caching a privileged redirect for the public', async () => {
  getCurrentVolunteer.mockResolvedValue({ id: 'expert' });
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const response = await GET(new NextRequest('https://archive.example/api/files/file'), context);
  expect(response.status).toBe(307);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(fetcher).not.toHaveBeenCalled();
});
it('does not serve binned published files to a visitor or a non-admin expert', async () => {
  item.deleted_at = '2026-10-20';
  expect((await GET(new NextRequest('https://archive.example/api/files/file'), context)).status).toBe(403);
  getCurrentVolunteer.mockResolvedValue({ id: 'expert' });
  expect((await GET(new NextRequest('https://archive.example/api/files/file'), context)).status).toBe(403);
  expect(createSignedUrl).not.toHaveBeenCalled();
});
