// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const rpc = vi.fn();
const download = vi.fn();
const readInBackground = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabase: () => ({ rpc, storage: { from: () => ({ download }) } }) }));
vi.mock('@/lib/items/background-reading', () => ({ readInBackground }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn() }));
vi.mock('@/lib/vocabulary/mutations', () => ({ recordCandidates: vi.fn() }));
vi.mock('@/lib/contributors', () => ({ registerContributor: vi.fn() }));
const { storedChecksum } = await import('@/lib/files/server-hash');
const { retryOneReading } = await import('@/lib/items/retry-reading');
const { resolveDuplicate } = await import('@/lib/items/mutations');
beforeEach(() => { vi.resetAllMocks(); });

describe('authoritative storage checksum', () => {
  it('hashes stored bytes independent of the filename and browser hint', async () => {
    download.mockResolvedValue({ data: new Blob(['actual stored content']), error: null });
    expect(await storedChecksum('uploads/original.pdf')).toBe(createHash('sha256').update('actual stored content').digest('hex'));
    expect(download).toHaveBeenCalledWith('uploads/original.pdf');
  });
  it('fails closed when storage is unavailable', async () => {
    download.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
    await expect(storedChecksum('missing')).rejects.toThrow('checksum_storage_unavailable');
  });
});
describe('duplicate mutation boundary', () => {
  it.each(['merged', 'not_duplicate'] as const)('delegates %s to one atomic actor-scoped transaction', async (resolution) => {
    rpc.mockResolvedValue({ data: 'older-record', error: null });
    expect(await resolveDuplicate('current-item', 'pair', 'expert', resolution)).toBe('older-record');
    expect(rpc).toHaveBeenCalledExactlyOnceWith('resolve_item_duplicate', {
      p_item: 'current-item', p_pair: 'pair', p_actor: 'expert', p_resolution: resolution,
    });
  });
  it('propagates a concurrently resolved or forbidden pair instead of reporting success', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('already resolved') });
    await expect(resolveDuplicate('current', 'pair', 'expert', 'merged')).rejects.toThrow('already resolved');
  });
});
describe('retry execution', () => {
  it('does not call AI when a competing worker owns the lease or no eligible row remains', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await retryOneReading('item', 'expert')).toBe(false);
    expect(readInBackground).not.toHaveBeenCalled();
  });
  it('sends precisely the claimed file and generation to the existing reader', async () => {
    rpc.mockResolvedValue({ data: [{
      analysis_id: 'analysis', item_id: 'item', file_id: 'file', title: 'Record',
      storage_path: 'stored', file_name: 'page.pdf', retry_count: 2, last_retry_at: '2026-10-20T01:15:00Z',
    }], error: null });
    expect(await retryOneReading(null, null, 123)).toBe(true);
    expect(readInBackground).toHaveBeenCalledExactlyOnceWith({
      itemId: 'item', title: 'Record', files: [{
        fileId: 'file', storagePath: 'stored', fileName: 'page.pdf',
        analysisId: 'analysis', retryCount: 2, lastRetryAt: '2026-10-20T01:15:00Z',
      }],
    }, 123);
  });
  it('does not invoke the reader after a failed database claim', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('database unavailable') });
    await expect(retryOneReading('item', 'expert')).rejects.toThrow('database unavailable');
    expect(readInBackground).not.toHaveBeenCalled();
  });
});
