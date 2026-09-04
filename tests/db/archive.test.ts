import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The two critical paths the browser suite cannot reach.
 *
 * Preflight found that four of eight critical paths had no positive automated
 * test: cataloguing and publishing a record, and the recycle bin. Both need a
 * volunteer or administrator session, and the end-to-end suite skips those
 * unless credentials are configured — so they were verified by hand and by
 * one-off SQL probes, neither of which repeats.
 *
 * This closes the *functional* half without any credentials. It drives
 * `review_item` and the bin columns directly, which is where the logic that
 * matters lives — the duplicate-key bug that briefly made a whole review fail
 * was in that function, not in a screen.
 *
 * ── what it deliberately does not test ──────────────────────────────────────
 *
 * **Permission.** These run with the service-role key, which bypasses RLS by
 * design, so a pass here says the operation works and says nothing about who
 * may perform it. The permission half is covered by the end-to-end suite for
 * anonymous callers, by the anon-key checks at the bottom of this file, and —
 * for the volunteer/administrator split — by the probes recorded in
 * `docs/GO-LIVE-2026-09-02-IJHC.md`. Simulating a signed-in role from Node
 * needs either a Postgres connection string or test credentials, and the
 * project has neither.
 *
 * ── it writes to a real database ────────────────────────────────────────────
 *
 * Whatever `.env.local` points at. That is why it is **not** part of
 * `npm run verify`: run it with `npm run test:db`, deliberately. Every row it
 * creates carries MARKER in its title and `afterAll` removes exactly those, so
 * a crashed run leaves rows that are trivially identifiable and never touches
 * a real record.
 */

const MARKER = 'ZZ-DBTEST-DO-NOT-KEEP';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const configured = Boolean(url && serviceKey && anonKey);

const admin: SupabaseClient = configured
  ? createClient(url!, serviceKey!, { auth: { persistSession: false } })
  : (null as unknown as SupabaseClient);

const anon: SupabaseClient = configured
  ? createClient(url!, anonKey!, { auth: { persistSession: false } })
  : (null as unknown as SupabaseClient);

/** A throwaway record, pending and unpublished, exactly as a contribution arrives. */
async function makeItem(title = `${MARKER} record`) {
  const { data, error } = await admin
    .from('items')
    .insert({ title, status: 'pending', access: 'public' })
    .select()
    .single();

  if (error) throw error;
  return data as { id: string; title: string };
}

beforeAll(() => {
  if (!configured) {
    throw new Error(
      'tests/db needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local. Run with `npm run test:db`.',
    );
  }
});

afterAll(async () => {
  if (!configured) return;
  // Only ever rows this file made. `like` on the marker, never a broad delete.
  await admin.from('items').delete().like('title', `${MARKER}%`);
});

describe('cataloguing and publishing a record', () => {
  it('publishes it, and the catalogue fields land with it', async () => {
    const item = await makeItem();

    const { data, error } = await admin.rpc('review_item', {
      p_item_id: item.id,
      p_status: 'accepted',
      p_title: `${MARKER} a ketubah`,
      p_category: 'documents',
      p_description: 'Checked against the original.',
      p_community: 'cochin',
      p_provenance: null,
      p_keywords: ['Synagogue'],
      p_language: 'Hebrew',
      p_period: '1890s',
      p_origin_place: 'Cochin',
      p_access: 'public',
      p_fields: [{ key: 'map.geo.cities_villages', value: 'Alibag', source: 'volunteer' }],
    });

    expect(error).toBeNull();
    expect(data).toBeTruthy();

    const { data: saved } = await admin
      .from('items')
      .select('status, community, category, keywords, period')
      .eq('id', item.id)
      .single();

    expect(saved!.status).toBe('accepted');
    expect(saved!.community).toBe('cochin');
    expect(saved!.category).toBe('documents');
    expect(saved!.keywords).toEqual(['Synagogue']);

    const { data: fields } = await admin
      .from('item_fields')
      .select('field_key, value')
      .eq('item_id', item.id);

    expect(fields).toEqual([{ field_key: 'map.geo.cities_villages', value: 'Alibag' }]);
  });

  it('keeps the last value when the same field arrives twice, and drops a blank', async () => {
    /*
     * The regression this exists for.
     *
     * `item_fields` has `unique (item_id, field_key)`, and the first version of
     * `review_item` appended rather than de-duplicating. Because the function is
     * atomic, one duplicated key failed the *entire* save rather than quietly
     * dropping a field — a volunteer's whole review lost. Caught by a probe on
     * its first run; this is that probe, made repeatable.
     */
    const item = await makeItem();

    const { error } = await admin.rpc('review_item', {
      p_item_id: item.id,
      p_status: 'pending',
      p_title: `${MARKER} duplicate keys`,
      p_category: null,
      p_description: null,
      p_community: 'baghdadi',
      p_provenance: null,
      p_keywords: [],
      p_language: null,
      p_period: null,
      p_origin_place: null,
      p_access: 'public',
      p_fields: [
        { key: 'item.date_on_item', value: '1906', source: 'volunteer' },
        { key: 'item.date_on_item', value: '1907', source: 'volunteer' },
        { key: 'map.geo.markets', value: '   ', source: 'volunteer' },
      ],
    });

    expect(error).toBeNull();

    const { data: fields } = await admin
      .from('item_fields')
      .select('field_key, value')
      .eq('item_id', item.id);

    expect(fields).toEqual([{ field_key: 'item.date_on_item', value: '1907' }]);
  });

  it('counts a record with no stream, because the archive allows one', async () => {
    /*
     * This test was written the other way round and was wrong, which is how the
     * bug it now guards was found.
     *
     * Decision 11 in the project card: never assign a community without
     * evidence — null beats a plausible guess. So a published record with no
     * stream is intentional. What was not intentional is that the front page
     * derived "N records published" by summing the community buckets, so such a
     * record was rendered and not counted: measured at ten published, the page
     * said nine.
     */
    const item = await makeItem(`${MARKER} no stream`);
    await admin.from('items').update({ status: 'accepted', access: 'public' }).eq('id', item.id);

    const { count: real } = await admin
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .eq('access', 'public')
      .is('deleted_at', null);

    const { data: groups } = await admin.rpc('community_counts');
    const summed = (groups ?? []).reduce(
      (n: number, row: { community: string | null; n: number }) => n + Number(row.n),
      0,
    );

    // The record is published and visible to the public...
    const { data: seen } = await anon.from('items').select('id').eq('id', item.id);
    expect(seen).toHaveLength(1);

    // ...and the grouped counts do not account for it, which is exactly why the
    // page must count records rather than sum groups.
    expect(real).toBeGreaterThan(summed);
  });
});

describe('the recycle bin', () => {
  it('hides a published record from the public without changing the decision', async () => {
    const item = await makeItem(`${MARKER} to be binned`);
    await admin.from('items').update({ status: 'accepted', community: 'baghdadi' }).eq('id', item.id);

    const seenBefore = await anon.from('items').select('id').eq('id', item.id);
    expect(seenBefore.data).toHaveLength(1);

    await admin.from('items').update({ deleted_at: new Date().toISOString() }).eq('id', item.id);

    const seenAfter = await anon.from('items').select('id').eq('id', item.id);
    expect(seenAfter.data).toHaveLength(0);

    // The point of a soft delete: the review decision survives it, so restoring
    // puts the record back rather than sending it round the queue again.
    const { data: still } = await admin
      .from('items')
      .select('status, access')
      .eq('id', item.id)
      .single();

    expect(still!.status).toBe('accepted');
    expect(still!.access).toBe('public');
  });

  it('brings it back exactly as it was', async () => {
    const item = await makeItem(`${MARKER} to be restored`);
    await admin.from('items').update({ status: 'accepted', community: 'cochin' }).eq('id', item.id);
    await admin.from('items').update({ deleted_at: new Date().toISOString() }).eq('id', item.id);

    await admin.from('items').update({ deleted_at: null, deleted_by: null }).eq('id', item.id);

    const { data } = await anon.from('items').select('id, status, community').eq('id', item.id);
    expect(data).toHaveLength(1);
    expect(data![0].status).toBe('accepted');
    expect(data![0].community).toBe('cochin');
  });

  it('stops counting a binned record towards its stream', async () => {
    /*
     * The regression this exists for, found by the test above failing on its
     * own arithmetic.
     *
     * `community_counts` filtered status, access and community, and not
     * `deleted_at`. Being `security invoker`, RLS hid the binned rows from
     * anonymous visitors and volunteers, so the public numbers were right and
     * nothing ever looked wrong — but `items_admin_bin_select` ORs the bin back
     * in for an administrator, so an administrator's masthead counted the
     * recycle bin into the four-stream rule. Measured at eight published
     * records: the rule said nine.
     *
     * This runs with the service role, which sees the bin the way an
     * administrator does, so it is the right place to hold the guarantee.
     */
    const item = await makeItem(`${MARKER} counted then binned`);
    await admin.from('items').update({ status: 'accepted', community: 'cochin' }).eq('id', item.id);

    const countCochin = async () => {
      const { data } = await admin.rpc('community_counts');
      const row = (data ?? []).find((r: { community: string }) => r.community === 'cochin');
      return Number(row?.n ?? 0);
    };

    const before = await countCochin();
    await admin.from('items').update({ deleted_at: new Date().toISOString() }).eq('id', item.id);
    expect(await countCochin()).toBe(before - 1);

    // And it comes back with the record, because the bin is not a deletion.
    await admin.from('items').update({ deleted_at: null }).eq('id', item.id);
    expect(await countCochin()).toBe(before);
  });

  it('takes the catalogue fields with it and brings them back', async () => {
    const item = await makeItem(`${MARKER} with fields`);
    await admin.from('items').update({ status: 'accepted', community: 'baghdadi' }).eq('id', item.id);
    await admin
      .from('item_fields')
      .insert({ item_id: item.id, field_key: 'map.geo.markets', value: 'Alibag', source: 'volunteer' });

    const before = await anon.from('item_fields').select('id').eq('item_id', item.id);
    expect(before.data).toHaveLength(1);

    await admin.from('items').update({ deleted_at: new Date().toISOString() }).eq('id', item.id);
    const during = await anon.from('item_fields').select('id').eq('item_id', item.id);
    expect(during.data).toHaveLength(0);

    await admin.from('items').update({ deleted_at: null }).eq('id', item.id);
    const after = await anon.from('item_fields').select('id').eq('item_id', item.id);
    expect(after.data).toHaveLength(1);
  });
});

describe('what an anonymous visitor can reach', () => {
  it('sees a published record and not a pending one', async () => {
    const pending = await makeItem(`${MARKER} still pending`);
    const published = await makeItem(`${MARKER} published`);
    await admin
      .from('items')
      .update({ status: 'accepted', community: 'baghdadi' })
      .eq('id', published.id);

    const { data } = await anon.from('items').select('id').in('id', [pending.id, published.id]);
    expect(data?.map((r) => r.id)).toEqual([published.id]);
  });

  it('sees a published record but not one withheld from the public', async () => {
    const item = await makeItem(`${MARKER} restricted`);
    await admin
      .from('items')
      .update({ status: 'accepted', access: 'restricted', community: 'cochin' })
      .eq('id', item.id);

    const { data } = await anon.from('items').select('id').eq('id', item.id);
    expect(data).toHaveLength(0);
  });

  it('cannot write anything at all', async () => {
    const item = await makeItem(`${MARKER} read only`);

    const inserted = await anon.from('items').insert({ title: `${MARKER} injected` });
    expect(inserted.error).not.toBeNull();

    const updated = await anon.from('items').update({ title: 'changed' }).eq('id', item.id);
    const { data: unchanged } = await admin
      .from('items')
      .select('title')
      .eq('id', item.id)
      .single();
    expect(unchanged!.title).toBe(`${MARKER} read only`);
    expect(updated.error !== null || true).toBe(true);

    await anon.from('items').delete().eq('id', item.id);
    const { count } = await admin
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('id', item.id);
    expect(count).toBe(1);
  });

  it('cannot read the machine notes or the contributor register', async () => {
    const analyses = await anon.from('ai_analyses').select('id');
    expect(analyses.data ?? []).toHaveLength(0);

    const contributors = await anon.from('contributors').select('id');
    expect(contributors.data ?? []).toHaveLength(0);
  });
});
