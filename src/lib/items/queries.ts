import 'server-only';
import { emptyCommunityCounts } from '@/lib/communities';
import { createServerSupabase } from '@/lib/supabase/server';
import { getContributor } from '@/lib/contributors';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getCurrentVolunteer } from '@/lib/supabase/server';
import { REVIEW_QUEUE_STATUSES } from './status';
import { inTreeOrder } from '@/lib/fields/registry';
import type {
  AiAnalysis,
  Community,
  Item,
  ItemCategory,
  ItemDetail,
  ItemEvent,
  ItemField,
  ItemFile,
} from '@/lib/types';

/**
 * Every read in the app goes through this module.
 *
 * All of it runs on the server against the visitor's own session, so RLS is the
 * thing that decides what comes back. A missing filter here is a bug; a missing
 * filter combined with RLS is still not a leak.
 */

export interface PortalFilters {
  query?: string;
  category?: ItemCategory;
  community?: Community;
  /** Everything one person sent. See `listItemsByContributor`. */
  contributorEmail?: string;
  /** Caps the rows fetched. The portal wants all of them; the front page does not. */
  limit?: number;
}

type FileRow = ItemFile;

/** Page order, with the primary first whatever its position says. */
function orderedFiles(files: FileRow[] | null | undefined): ItemFile[] {
  if (!files?.length) return [];
  return [...files].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return (a.position ?? 0) - (b.position ?? 0);
  });
}

function primaryFile(files: FileRow[] | null | undefined): ItemFile | null {
  return orderedFiles(files)[0] ?? null;
}

/**
 * Tree fields in the tree's own order.
 *
 * Postgres returns them in whatever order it likes, so without this the record
 * page and the review screen would list the same fields differently, and a
 * volunteer working through a queue would have to re-find "Community" on every
 * record. A key no longer in the registry sorts last and renders under its raw
 * key — a renamed branch loses its label, not its value.
 */
function orderedFields(fields: ItemField[] | null | undefined): ItemField[] {
  return inTreeOrder(fields ?? [], (f) => f.field_key);
}

/**
 * The analysis of the record's primary file.
 *
 * A record can hold several files and each is read on its own, so "the
 * analysis" has to mean something specific. It means the one that looked at the
 * file the record leads with. `file_id` is null on rows written before an item
 * could have more than one file, and those fall back to the newest.
 */
function analysisFor(analyses: AiAnalysis[], file: ItemFile | null): AiAnalysis | null {
  const sorted = [...analyses].sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (file) {
    const match = sorted.find((a) => a.file_id === file.id);
    if (match) return match;
  }
  return sorted[0] ?? null;
}

/**
 * A search term made safe for `ilike`.
 *
 * `%` and `_` are wildcards, so a search for "50%" without this is a search for
 * "50 followed by anything" — a match-everything. It lives here rather than at
 * each call site because it was written out twice and the second copy was
 * wrong: an over-escaped backslash turned it into an escaped dollar sign, so
 * the escape produced the literal text `${c}` and the two queries no longer
 * filtered alike. Caught by the linter noticing the argument had gone unused.
 */
export function likeTerm(query: string): string {
  return query.trim().replace(/[%_\\]/g, (character) => '\\' + character);
}

/**
 * Everything one contributor sent, found by the address they left.
 *
 * ── open to anyone, and bounded by what is already public ───────────────────
 *
 * A visitor sees **only records that are already published and public** — the
 * same rows the portal shows anyone who scrolls. So this reveals nothing new;
 * it groups what is already there by the person who sent it, which is what
 * makes it useful to a family who contributed a dozen photographs and wants to
 * find them again without an account.
 *
 * What it does newly reveal is *that a given address contributed at all*, and
 * that is why the terms changed with it: version `2026-09-06` says plainly
 * that anyone who knows the address can look up the public records sent from
 * it. The previous wording promised the opposite, and a promise the code
 * contradicts is worse than either.
 *
 * **A volunteer sees more**, and only a volunteer: material still in review,
 * held back from public view, or declined. That distinction is the whole
 * safety of this — an unpublished contribution is family material a person has
 * not yet had a decision about, and it stays invisible to everyone but the
 * archive.
 *
 * The address itself is resolved through `contributors`, which RLS restricts to
 * volunteers, so the lookup runs with the service role for the public path and
 * returns **only** the id. No address is ever read back out to a visitor.
 */
export async function listItemsByContributor(
  email: string,
): Promise<(Item & { file: ItemFile | null })[]> {
  const address = email.trim().toLowerCase();
  if (!address) return [];

  const volunteer = Boolean(await getCurrentVolunteer());

  // The service role resolves the address to an id and nothing else. Doing it
  // as the caller would return nothing for a visitor — `contributors` is
  // volunteer-only and stays that way — and the id is not the address.
  const { data: contributor, error: lookupError } = await createAdminSupabase()
    .from('contributors')
    .select('id')
    .ilike('email', likeTerm(address))
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!contributor) return [];

  const supabase = await createServerSupabase();
  let q = supabase
    .from('items')
    .select('*, item_files(*)')
    .eq('contributor_id', contributor.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  // The gate. Everything a visitor gets back is a row they could already have
  // reached from the portal; RLS would refuse the rest anyway, and saying so
  // here as well is the archive's rule about enforcing permission in more than
  // one place.
  if (!volunteer) {
    q = q.eq('status', 'accepted').eq('access', 'public');
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(({ item_files, ...item }) => ({
    ...(item as Item),
    file: primaryFile(item_files as FileRow[]),
  }));
}

/** Published items for the public portal. */
export async function listPublishedItems(filters: PortalFilters = {}): Promise<(Item & { file: ItemFile | null })[]> {
  const supabase = await createServerSupabase();

  let q = supabase
    .from('items')
    .select('*, item_files(*)')
    .eq('status', 'accepted')
    .eq('access', 'public')
    // Redundant for everyone but an administrator, whose `items_admin_bin_select`
    // policy ORs the bin back in. RLS excludes it for every other role.
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (filters.limit) q = q.limit(filters.limit);
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.community) q = q.eq('community', filters.community);
  if (filters.query?.trim()) {
    q = q.ilike('search_text', `%${likeTerm(filters.query)}%`);
  }

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map(({ item_files, ...item }) => ({
    ...(item as Item),
    file: primaryFile(item_files as FileRow[]),
  }));
}

/** One published record. Returns null for anything not public, by way of RLS. */
export async function getPublishedItem(
  id: string,
): Promise<(Item & { file: ItemFile | null; files: ItemFile[]; fields: ItemField[] }) | null> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from('items')
    .select('*, item_files(*), item_fields(*)')
    .eq('id', id)
    .eq('status', 'accepted')
    .eq('access', 'public')
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { item_files, item_fields, ...item } = data;
  const files = orderedFiles(item_files as FileRow[]);
  return {
    ...(item as Item),
    file: files[0] ?? null,
    files,
    fields: orderedFields(item_fields as ItemField[]),
  };
}

/** How many published items each community holds. Drives the four-stream rule. */
export async function getCommunityCounts(): Promise<Record<Community, number>> {
  const supabase = await createServerSupabase();

  // Counted in the database. This used to fetch every published row and count
  // them in JavaScript — invisible at eight records, a full table transfer on
  // every page load at eight hundred. RLS still governs what the function can
  // see, because it is `security invoker`.
  const { data, error } = await supabase.rpc('community_counts');
  if (error) throw error;

  const counts = emptyCommunityCounts();
  for (const row of (data ?? []) as { community: Community; n: number }[]) {
    if (row.community) counts[row.community] = Number(row.n);
  }
  return counts;
}

/**
 * How many records are published, counting every one of them — and, given
 * filters, how many match.
 *
 * **This is the number a page should show, never the length of a list.**
 * PostgREST caps a response at a thousand rows and returns `error: null` when
 * it does: measured on this project, a 2500-row table came back as exactly a
 * thousand while `count: 'exact'` reported 2500. A page that prints
 * `items.length` will one day say "1000 records published" about an archive
 * holding four thousand, and nothing anywhere will look wrong.
 *
 * The front page used to derive this by summing the community counts, which
 * silently excludes a published record whose community is null — and a null
 * community is *deliberate*: the archive's rule is that no stream is better
 * than a guessed one (decision 11). Measured with one such record present, the
 * page rendered ten and said nine.
 *
 * Counted in the database rather than from `listPublishedItems`, because that
 * call is capped for the wall and its length is not the archive's size.
 */
export async function countPublishedItems(filters: PortalFilters = {}): Promise<number> {
  const supabase = await createServerSupabase();
  let q = supabase
    .from('items')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'accepted')
    .eq('access', 'public')
    .is('deleted_at', null);

  // The same predicates as `listPublishedItems`, so the two can be compared.
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.community) q = q.eq('community', filters.community);
  if (filters.query?.trim()) {
    q = q.ilike('search_text', `%${likeTerm(filters.query)}%`);
  }

  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/** The review queue. RLS returns nothing at all without a volunteer session. */
export async function listReviewQueue(): Promise<(Item & { file: ItemFile | null; analysis: AiAnalysis | null })[]> {
  const supabase = await createServerSupabase();

  // Named columns, not `*`. The queue renders cards that use four fields, and
  // `ai_analyses(*)` was dragging `raw` — the entire model response — plus the
  // OCR of every manuscript in the queue into a list page.
  const { data, error } = await supabase
    .from('items')
    .select(
      '*, item_files(*), ai_analyses(id, file_id, provider, model, status, summary, off_topic, off_topic_reason, created_at)',
    )
    .in('status', REVIEW_QUEUE_STATUSES)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map(({ item_files, ai_analyses, ...item }) => {
    const file = primaryFile(item_files as FileRow[]);
    return {
      ...(item as Item),
      file,
      analysis: analysisFor((ai_analyses as AiAnalysis[]) ?? [], file),
    };
  });
}

/** Full detail for the review workbench. */
export async function getItemDetail(id: string): Promise<ItemDetail | null> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from('items')
    .select('*, item_files(*), ai_analyses(*), item_fields(*)')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { item_files, ai_analyses, item_fields, ...item } = data;
  const files = orderedFiles(item_files as FileRow[]);
  const row = item as Item;

  return {
    ...row,
    file: files[0] ?? null,
    files,
    analysis: analysisFor((ai_analyses as AiAnalysis[]) ?? [], files[0] ?? null),
    fields: orderedFields(item_fields as ItemField[]),
    // Fetched rather than embedded: the register is `is_volunteer()`, so this
    // is null for anyone the policy does not admit, and the review screen is
    // the only place that asks for it.
    contributor: row.contributor_id ? await getContributor(row.contributor_id) : null,
  };
}

/**
 * The bin. Administrators only, and empty for everybody else — not by a filter
 * here but because `items_admin_bin_select` is the one policy that admits a
 * binned row at all.
 */
export async function listDeletedItems(): Promise<(Item & { file: ItemFile | null })[]> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from('items')
    .select('*, item_files(*)')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map(({ item_files, ...item }) => ({
    ...(item as Item),
    file: primaryFile(item_files as FileRow[]),
  }));
}

/** Audit trail for one item. */
export async function listItemEvents(itemId: string): Promise<ItemEvent[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('item_events')
    .select('*')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ItemEvent[];
}

/** Counts for the review queue badge. */
export async function countReviewQueue(): Promise<number> {
  const supabase = await createServerSupabase();
  const { count, error } = await supabase
    .from('items')
    .select('id', { count: 'exact', head: true })
    .in('status', REVIEW_QUEUE_STATUSES)
    .is('deleted_at', null);
  if (error) throw error;
  return count ?? 0;
}
