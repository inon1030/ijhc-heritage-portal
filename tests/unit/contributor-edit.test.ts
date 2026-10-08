import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  writes: [] as Record<string, unknown>[],
  events: [] as Record<string, unknown>[],
  from: vi.fn(), admin: vi.fn(),
  beforeUpdate: null as (() => void) | null,
}));
vi.mock('@/lib/env', () => ({ serviceRoleKey: () => 'test-receipt-secret' }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabase: db.admin }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn() }));
vi.mock('@/lib/contributors', () => ({ registerContributor: vi.fn() }));
vi.mock('@/lib/vocabulary/mutations', () => ({ recordCandidates: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/i18n', async () => {
  const { en, format } = await import('@/lib/i18n/messages');
  return { getMessages: vi.fn(async () => ({ t: (key: keyof typeof en, vars?: Record<string, string | number>) => format(en[key], vars) })) };
});
vi.mock('@/lib/problems/record', () => ({ recordProblem: vi.fn() }));

import { editContributorItem } from '@/lib/items/mutations';
import { getReceiptItem } from '@/lib/items/queries';
import { receiptFor } from '@/lib/items/receipt';
import { POST } from '@/app/api/items/[id]/contributor-edit/route';
import { __resetRateLimit } from '@/lib/rate-limit';
import { getMessages } from '@/lib/i18n';

const id = '8f14e45f-ea8d-4b7a-b0a2-1c2d3e4f5a6b';
const input = { title: '  Family photograph  ', contributorDescription: '  Our grandmother  ' };
beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimit();
  db.row = { id, status: 'pending', access: 'public', deleted_at: null, title: 'Before', contributor_description: 'Before', community: 'cochin' };
  db.writes = []; db.events = []; db.beforeUpdate = null;
  db.admin.mockImplementation(() => ({ from: db.from }));
  db.from.mockImplementation((table: string) => {
    const filters: [string, unknown][] = [];
    let update: Record<string, unknown> | undefined;
    const chain = {
      update: (value: Record<string, unknown>) => { update = value; return chain; },
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
      is: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
      maybeSingle: async () => {
        if (update) db.beforeUpdate?.();
        const matches = db.row && filters.every(([key, value]) => db.row![key] === value);
        if (!matches) return { data: null, error: null };
        if (update) { db.writes.push(update); Object.assign(db.row!, update); }
        return { data: { ...db.row }, error: null };
      },
      insert: async (event: Record<string, unknown>) => {
        expect(table).toBe('item_events'); db.events.push(event); return { error: null };
      },
    };
    return chain;
  });
});

describe('contributor mutation capability and atomic gate', () => {
  it('saves only the two allowed columns and records contributor provenance', async () => {
    expect(await editContributorItem(id, receiptFor(id), input)).toEqual({ ok: true });
    expect(db.writes).toEqual([{ title: 'Family photograph', contributor_description: 'Our grandmother' }]);
    expect(db.row).toMatchObject({ status: 'pending', access: 'public', community: 'cochin' });
    expect(db.events).toEqual([expect.objectContaining({ item_id: id, actor_id: null, action: 'edited', changes: expect.objectContaining({ edited_by: 'contributor' }) })]);
    expect(db.from.mock.calls.map(([table]) => table)).toEqual(['items', 'item_events']);
  });
  it.each(['accepted', 'rejected', 'shadow_gallery', 'deleted'])('refuses %s without writing anything', async (state) => {
    if (state === 'deleted') db.row!.deleted_at = '2026-10-08';
    else db.row!.status = state;
    const before = { ...db.row };
    expect(await editContributorItem(id, receiptFor(id), input)).toEqual({ ok: false, code: 'edit_closed' });
    expect(db.row).toEqual(before); expect(db.writes).toEqual([]); expect(db.events).toEqual([]);
  });
  it.each(['wrong', receiptFor('other-item'), undefined])('refuses bad or cross-item signature before any query', async (token) => {
    expect(await editContributorItem(id, token, input)).toEqual({ ok: false, code: 'forbidden' });
    expect(await getReceiptItem(id, token)).toBeNull();
    expect(db.admin).not.toHaveBeenCalled(); expect(db.from).not.toHaveBeenCalled();
  });
  it('clears a description to null', async () => {
    await editContributorItem(id, receiptFor(id), { ...input, contributorDescription: '  ' });
    expect(db.row!.contributor_description).toBeNull();
  });
  it.each([{ ...input, access: 'public' }, { ...input, title: ' ' }, { ...input, title: 'x'.repeat(201) }, { ...input, contributorDescription: 'x'.repeat(4001) }])('rejects invalid direct calls before querying', async (value) => {
    expect(await editContributorItem(id, receiptFor(id), value)).toEqual({ ok: false, code: 'invalid_request' });
    expect(db.admin).not.toHaveBeenCalled();
  });
});

function post(body: unknown = input, token = receiptFor(id)) {
  return POST(new NextRequest(`http://localhost/api/items/${id}/contributor-edit?t=${token}`, {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }), { params: Promise.resolve({ id }) });
}
describe('contributor route', () => {
  it('rejects a foreign signature before querying or resolving locale', async () => {
    expect((await post(input, receiptFor('other-item'))).status).toBe(403);
    expect(getMessages).not.toHaveBeenCalled(); expect(db.admin).not.toHaveBeenCalled();
  });
  it('independently rejects an already published record before UPDATE', async () => {
    db.row!.status = 'accepted';
    const response = await post();
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('receipt.editPublished');
    expect(db.from).toHaveBeenCalledTimes(1); expect(db.writes).toEqual([]);
  });
  it.each(['published', 'withdrawn', 'reviewed'])('re-reads a %s race and returns its reason', async (state) => {
    db.beforeUpdate = () => {
      if (state === 'withdrawn') db.row!.deleted_at = '2026-10-08';
      else db.row!.status = state === 'published' ? 'accepted' : 'rejected';
    };
    const response = await post();
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe(`receipt.edit${state[0].toUpperCase()}${state.slice(1)}`);
    expect(db.from).toHaveBeenCalledTimes(3); expect(db.writes).toEqual([]); expect(db.events).toEqual([]);
  });
  it('validates strictly before reading and rate-limits repeated saves', async () => {
    expect((await post({ ...input, status: 'accepted' })).status).toBe(400);
    expect(db.admin).not.toHaveBeenCalled();
    for (let n = 0; n < 19; n++) expect((await post()).status).toBe(200);
    const writes = db.writes.length;
    expect((await post()).status).toBe(429); expect(db.writes).toHaveLength(writes);
  });
});
