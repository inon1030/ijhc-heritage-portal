import 'server-only';
import type { CorrectionChanges } from './public-input';
import { cache } from 'react';
import { facetOptions, hasPortalFilters, matchesFacets, searchWords, intersectIds, type FacetFilters, type FacetRow } from './portal-facets';
import { reviewOrder } from './review-order';
export { readDuplicates } from './duplicate-queries';
export { readRetryState } from './retry-queries';
import { emptyCommunityCounts } from '@/lib/communities';
import { createServerSupabase } from '@/lib/supabase/server';
import { getContributor } from '@/lib/contributors';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getCurrentVolunteer } from '@/lib/supabase/server';
import { REVIEW_QUEUE_STATUSES } from './status';
import type { ReviewDraftPayload } from './draft-schema';
import { verifyReceipt } from './receipt';
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

export interface PublicComment {
  id: string; author_name: string | null; anonymous: boolean; body: string; created_at: string; hidden_at?: string | null;
}
export interface RecordCorrection {
  id: string; item_id: string; changes: CorrectionChanges; note: string | null;
  record_title: string | null;
  proposer_name: string | null; anonymous: boolean; created_at: string;
  objection_at: string | null; objection_note: string | null; status: string;
}
export async function readRecordComments(itemId: string, expert = false): Promise<PublicComment[]> {
  const supabase = await createServerSupabase();
  const allowed = expert && Boolean(await getCurrentVolunteer());
  const comments: PublicComment[] = [];
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await supabase.from(allowed ? 'record_comments' : 'public_record_comments')
      .select(`id,author_name,anonymous,body,created_at${allowed ? ',hidden_at' : ''}`)
      .eq('item_id', itemId).order('created_at').order('id').range(offset, offset + 199);
    if (error) throw error;
    comments.push(...(data ?? []) as unknown as PublicComment[]);
    if ((data?.length ?? 0) < 200) return comments;
  }
}
/** This is the only public projection of the approver: never email or a profile row. */
export async function readApproverName(itemId: string): Promise<string | null> {
  const item = await getPublishedItem(itemId);
  if (!item?.reviewed_by) return null;
  const { data, error } = await createAdminSupabase().from('profiles').select('full_name').eq('id', item.reviewed_by).maybeSingle();
  if (error) throw error;
  return data?.full_name?.trim() || null;
}
export async function readRecordCorrections(itemId?: string): Promise<RecordCorrection[]> {
  if (!await getCurrentVolunteer()) return [];
  let query = (await createServerSupabase()).from('record_corrections')
    .select('id,item_id,changes,note,proposer_name,anonymous,created_at,objection_at,objection_note,status,record:items(title)')
    .eq('status', 'pending').order('created_at');
  if (itemId) query = query.eq('item_id', itemId);
  const { data, error } = await query.limit(200);
  if (error) throw error;
  return (data ?? []).map(row => {
    const { record, ...correction } = row;
    const linked = record as unknown as { title: string } | null;
    return { ...correction, record_title: linked?.title ?? null } as RecordCorrection;
  });
}

/** Server-only mail projection. No route or component serializes these addresses. */
export async function readFeedbackRecipients(item: Item): Promise<{ email: string; language: string | null; uploader: boolean }[]> {
  const admin = createAdminSupabase();
  const result: { email: string; language: string | null; uploader: boolean }[] = [];
  if (item.contributor_id) {
    const { data, error } = await admin.from('contributors').select('email').eq('id', item.contributor_id).maybeSingle();
    if (error) throw error;
    if (data?.email) result.push({ email: data.email, language: item.contributor_language ?? null, uploader: true });
  }
  if (item.reviewed_by) {
    const { data, error } = await admin.from('profiles').select('email,notify_publications').eq('id', item.reviewed_by).maybeSingle();
    if (error) throw error;
    if (data?.email && data.notify_publications !== false && !result.some(r => r.email.trim().toLowerCase() === data.email.trim().toLowerCase())) {
      const { data: user } = await admin.auth.admin.getUserById(item.reviewed_by);
      const language = user.user?.user_metadata?.language;
      result.push({ email: data.email, language: typeof language === 'string' ? language : null, uploader: false });
    }
  }
  return result;
}

/**
 * Every read in the app goes through this module.
 *
 * All of it runs on the server against the visitor's own session, so RLS is the
 * thing that decides what comes back. A missing filter here is a bug; a missing
 * filter combined with RLS is still not a leak.
 */

export interface PortalFilters extends FacetFilters {
  offset?: number;
  query?: string;
  category?: ItemCategory;
  community?: Community;
  /** Everything one person sent. See `listItemsByContributor`. */
  contributorEmail?: string;
  /** Page size; absent means every match (for example, the sitemap). */
  limit?: number;
}

type FileRow = ItemFile;

/** Receipt-only projection: no identity, consent or contact columns. */
export async function getReceiptItem(id: string, token: unknown) {
  if (!verifyReceipt(id, token)) return null;
  const { data, error } = await createAdminSupabase().from('items')
    .select('title, contributor_description, status, access, created_at, deleted_at, item_files(*)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  return data as (Pick<Item, 'title' | 'contributor_description' | 'status' | 'access' | 'created_at' | 'deleted_at'> & { item_files: ItemFile[] }) | null;
}

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
  filters: PortalFilters = {},
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
    .select('*, item_files(*), item_fields(field_key,value), item_families(families(id,name))')
    .eq('contributor_id', contributor.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  // The gate. Everything a visitor gets back is a row they could already have
  // reached from the portal; RLS would refuse the rest anyway, and saying so
  // here as well is the archive's rule about enforcing permission in more than
  // one place.
  if (!volunteer) {
    q = q.eq('status', 'accepted').eq('access', 'public').not('category', 'is', null);
  }

  const data = await readPages((from, to) => q.range(from, to));
  const ids = await searchItemIds(filters.query ?? '');
  const matching = ids === null ? null : new Set(ids);
  return (data ?? []).filter(row => (!matching || matching.has(row.id)) && matchesFacets(row as unknown as FacetRow, filters))
    .map(({ item_files, ...item }) => ({
    ...(item as Item),
    file: primaryFile(item_files as FileRow[]),
  }));
}

/** Published items for the public portal. */
export async function listPublishedItems(filters: PortalFilters = {}): Promise<(Item & { file: ItemFile | null })[]> {
  if (!hasPortalFilters(filters)) {
    const db = await createServerSupabase();
    const offset = filters.offset ?? 0;
    const load = (from: number, to: number) => db.from('items').select('*, item_files(*)')
      .eq('status', 'accepted').eq('access', 'public').not('category', 'is', null).is('deleted_at', null)
      .order('created_at', { ascending: false }).order('id').range(offset + from, offset + to);
    const data = await readPages((from, to) => filters.limit && from >= filters.limit
      ? Promise.resolve({ data: [], error: null })
      : load(from, filters.limit ? Math.min(to, filters.limit - 1) : to));
    return data.map(({ item_files, ...item }) => ({ ...(item as Item), file: primaryFile(item_files as FileRow[]) }));
  }
  const rows = await matchingPublicRows(JSON.stringify(filters));
  const ids = rows.slice(filters.offset ?? 0, filters.limit ? (filters.offset ?? 0) + filters.limit : undefined).map(row => row.id);
  const supabase = await createServerSupabase();
  const result: (Item & { file: ItemFile | null })[] = [];
  // Small IN batches avoid exceeding proxy URL limits on large archives/sitemaps.
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await supabase.from('items').select('*, item_files(*)')
      .in('id', ids.slice(offset, offset + 100)).eq('status', 'accepted').eq('access', 'public')
      .not('category', 'is', null).is('deleted_at', null);
    if (error) throw error;
    result.push(...(data ?? []).map(({ item_files, ...item }) => ({ ...(item as Item), file: primaryFile(item_files as FileRow[]) })));
  }
  const byId = new Map(result.map(row => [row.id, row]));
  return ids.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
}

/**
 * The newest arrivals on the public shelf, for the front page.
 *
 * Ordered by when a Content Expert published the record, not by when it was
 * uploaded: an item that waited three weeks in review is new to a visitor the
 * day it appears. Same visibility rules as `listPublishedItems`.
 */
export async function listRecentlyPublished(limit = 8): Promise<(Item & { file: ItemFile | null })[]> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from('items')
    .select('*, item_files(*)')
    .eq('status', 'accepted')
    .eq('access', 'public').not('category', 'is', null)
    .is('deleted_at', null)
    .order('reviewed_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);
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
  if (data.category === null && !(await getCurrentVolunteer())) return null;

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

  const counts = emptyCommunityCounts();
  await Promise.all(Object.keys(counts).map(async (community) => {
    const { count, error } = await supabase.from('items').select('id', { count: 'exact', head: true })
      .eq('status', 'accepted').eq('access', 'public').not('category', 'is', null)
      .is('deleted_at', null).eq('community', community);
    if (error) throw error;
    counts[community as Community] = count ?? 0;
  }));
  return counts;
}

/** The exact same uncapped matching set as the list, before pagination. */
export async function countPublishedItems(filters: PortalFilters = {}): Promise<number> {
  if (!hasPortalFilters(filters)) {
    const db = await createServerSupabase();
    const { count, error } = await db.from('items').select('id', { count: 'exact', head: true })
      .eq('status', 'accepted').eq('access', 'public').not('category', 'is', null).is('deleted_at', null);
    if (error) throw error;
    return count ?? 0;
  }
  return (await matchingPublicRows(JSON.stringify(filters))).length;
}

/** The review queue. RLS returns nothing at all without a volunteer session. */
export async function listReviewQueue(): Promise<(Item & { file: ItemFile | null; analysis: AiAnalysis | null })[]> {
  const supabase = await createServerSupabase();

  // Named columns, not `*`. The queue renders cards that use four fields, and
  // `ai_analyses(*)` was dragging `raw` — the entire model response — plus the
  // OCR of every manuscript in the queue into a list page.
  const data = await readPages((from, to) => supabase
    .from('items')
    .select(
      '*, item_files(*), ai_analyses(id, file_id, provider, model, status, summary, keywords, off_topic, off_topic_reason, created_at)',
    )
    .in('status', REVIEW_QUEUE_STATUSES)
    .is('deleted_at', null)
    .order('created_at', { ascending: true }).order('id').range(from, to));


  return reviewOrder((data ?? []).map(({ item_files, ai_analyses, ...item }) => {
    const file = primaryFile(item_files as FileRow[]);
    const analyses = (ai_analyses as AiAnalysis[]) ?? [];
    // The latest reading of each further file. A file that was never read on its
    // own (items from before per-file readings) is not counted against the item.
    const otherReadings = orderedFiles(item_files as FileRow[])
      .filter((f) => f.id !== file?.id)
      .map((f) => analyses.filter((a) => a.file_id === f.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.status ?? null)
      .filter((status): status is AiAnalysis['status'] => status !== null);
    return {
      ...(item as Item),
      file,
      analysis: analysisFor(analyses, file),
      otherReadings,
    };
  }));
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

/** One row of the problem log (0031), as an administrator reads it. */
export interface ProblemEntry {
  code: string;
  created_at: string;
  source: 'server' | 'browser';
  place: string | null;
  path: string | null;
  message: string;
  detail: string | null;
  user_agent: string | null;
}

/**
 * The newest problems, or the one a report quotes.
 *
 * Through the signed-in client, so RLS (`problems_admin_select`) is what
 * decides: anybody but an administrator gets an empty list, whatever the
 * screen above this asked for.
 */
export async function listProblems(code?: string): Promise<ProblemEntry[]> {
  const supabase = await createServerSupabase();
  let query = supabase
    .from('problems')
    .select('code, created_at, source, place, path, message, detail, user_agent')
    .order('created_at', { ascending: false })
    .limit(100);
  const wanted = code?.trim().toUpperCase();
  if (wanted) query = query.eq('code', wanted.startsWith('E-') ? wanted : `E-${wanted}`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ProblemEntry[];
}

/** Repair shelf for existing experts; no row is modified. */
export async function listUncataloguedPublished() {
  const supabase = await createServerSupabase();
  const data = await readPages((from, to) => supabase.from('items').select('*, item_files(*)')
    .eq('status', 'accepted').is('category', null).is('deleted_at', null)
    .order('created_at', { ascending: true }).order('id').range(from, to));
  return (data ?? []).map(({ item_files, ...item }) => ({
    ...(item as Item), file: primaryFile(item_files as FileRow[]), analysis: null,
  }));
}

/** Read all pages: PostgREST's implicit row cap must never hide matches. */
export async function readPages<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await load(from, from + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

export async function readReviewDraft(itemId: string) {
  const actor = await getCurrentVolunteer();
  if (!actor) return null;
  const db = await createServerSupabase();
  const { data, error } = await db.from('review_drafts').select('payload, updated_at')
    .eq('item_id', itemId).eq('profile_id', actor.id).maybeSingle();
  if (error) throw error;
  return data as { payload: ReviewDraftPayload; updated_at: string } | null;
}

export async function listReviewDrafts() {
  const actor = await getCurrentVolunteer();
  if (!actor) return [];
  const db = await createServerSupabase();
  const rows = await readPages((from, to) => db.from('review_drafts')
    .select('item_id, updated_at, items!inner(title, deleted_at)')
    .eq('profile_id', actor.id).is('items.deleted_at', null)
    .order('updated_at').order('item_id').range(from, to));
  return rows as unknown as { item_id: string; updated_at: string; items: { title: string } }[];
}

export interface ReviewCandidate {
  id: string;
  term: string;
  source: string;
  similar: { id: string; term: string; score: number }[];
}
export async function readReviewCandidates(itemId: string): Promise<ReviewCandidate[]> {
  if (!await getCurrentVolunteer()) return [];
  const db = await createServerSupabase();
  const data: { id: string; term: string; source: string | null }[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data: page, error } = await db.from('keyword_candidates')
      .select('id, term, source, item_id, first_item_id').eq('status', 'open')
      .or(`item_id.eq.${itemId},first_item_id.eq.${itemId}`).order('created_at').order('id').range(offset, offset + 499);
    if (error && ['42703', 'PGRST204'].includes(error.code)) return [];
    if (error) throw error;
    data.push(...(page ?? []));
    if ((page?.length ?? 0) < 500) break;
  }
  const result: ReviewCandidate[] = [];
  // No selection cap; bound concurrent similarity requests instead.
  for (let offset = 0; offset < data.length; offset += 10) {
    result.push(...await Promise.all(data.slice(offset, offset + 10).map(async candidate => {
      const { data: similar, error: matchError } = await db.rpc('similar_review_terms', { proposed: candidate.term });
      if (matchError) throw matchError;
      return { id: candidate.id, term: candidate.term, source: candidate.source ?? 'ai', similar: similar ?? [] };
    })));
  }
  return result;
}

/** Request-local cache only; never share one visitor's RLS results with another. */
const publicFacetRows = cache(async (): Promise<FacetRow[]> => {
  const db = await createServerSupabase();
  return await readPages((from, to) => db.from('items')
    .select('id, created_at, reviewed_at, category, community, keywords, period, origin_place, language, item_fields(field_key,value), item_files(mime_type), item_families(families(id,name))')
    .eq('status', 'accepted').eq('access', 'public').not('category', 'is', null).is('deleted_at', null)
    .order('created_at', { ascending: false }).order('id').range(from, to)) as unknown as FacetRow[];
});

/** Six source scans per word plus vocabulary resolution, never a query per item.
 * OCR/transcript remain private BY DESIGN under existing RLS, including translations.
 * Adding public search over them requires a separately approved permission change.
 */
const searchItemIds = cache(async (query: string): Promise<string[] | null> => {
  const words = searchWords(query);
  if (!words.length) return null;
  const db = await createServerSupabase();
  const vocabulary = await readPages((from, to) => db.from('keywords').select('id,term,preferred_id').order('id').range(from, to));
  const byId = new Map(vocabulary.map(k => [k.id, k]));
  const groups: string[][] = [];
  for (const word of words) {
    const term = '%' + likeTerm(word) + '%';
    // Quoting is for PostgREST's OR grammar; likeTerm separately escapes SQL wildcards.
    const quoted = JSON.stringify(term);
    const [items, fields, translated, families, keywords, labels] = await Promise.all([
      readPages((f,t) => db.from('items').select('id').or(['title','description','provenance','source','period','origin_place','search_text'].map(key => key + '.ilike.' + quoted).join(',')).order('id').range(f,t)),
      readPages((f,t) => db.from('item_fields').select('item_id,id').ilike('value',term).order('id').range(f,t)),
      readPages((f,t) => db.from('item_translations').select('item_id,lang,field').neq('field','transcript').ilike('value',term).order('item_id').order('lang').order('field').range(f,t)),
      readPages((f,t) => db.from('item_families').select('item_id,family_id,families!inner(name)').ilike('families.name',term).order('item_id').order('family_id').range(f,t)),
      readPages((f,t) => db.from('keywords').select('id').ilike('term',term).order('id').range(f,t)),
      readPages((f,t) => db.from('keyword_translations').select('keyword_id,lang').ilike('label',term).order('keyword_id').order('lang').range(f,t)),
    ]);
    const termIds = [...keywords.map(k => k.id), ...labels.map(k => k.keyword_id)];
    const names = new Set<string>();
    for (const id of termIds) {
      const entry = byId.get(id);
      if (!entry) continue;
      const preferred = entry.preferred_id ?? entry.id;
      for (const candidate of vocabulary) if (candidate.id === preferred || candidate.preferred_id === preferred) names.add(candidate.term);
    }
    // Keywords live as text[] on items. Match variants to the preferred stored spelling.
    const keywordItems: string[] = [];
    const allNames = [...names];
    for (let i = 0; i < allNames.length; i += 50) {
      keywordItems.push(...(await readPages((f,t) => db.from('items').select('id').overlaps('keywords',allNames.slice(i,i+50)).order('id').range(f,t))).map(row => row.id));
    }
    groups.push([...items.map(r => r.id), ...fields.map(r => r.item_id), ...translated.map(r => r.item_id), ...families.map(r => r.item_id), ...keywordItems]);
  }
  return intersectIds(groups);
});

const matchingPublicRows = cache(async (serialized: string) => {
  const filters: PortalFilters = JSON.parse(serialized);
  const [rows, ids] = await Promise.all([publicFacetRows(), searchItemIds(filters.query ?? '')]);
  const matching = ids === null ? null : new Set(ids);
  return rows.filter(row => (!matching || matching.has(row.id)) && matchesFacets(row, filters));
});

export async function getPortalFacetOptions(filters: PortalFilters = {}, scopeIds?: string[]) {
  const [rows, ids] = await Promise.all([publicFacetRows(), searchItemIds(filters.query ?? '')]);
  const matching = ids === null ? null : new Set(ids);
  const scope = scopeIds ? new Set(scopeIds) : null;
  return facetOptions(rows.filter(row => (!matching || matching.has(row.id)) && (!scope || scope.has(row.id))), filters);
}

/** One batched projection for every discrete link on the record, excluding itself. */
export async function getRelatedValueCounts(itemId: string) {
  return facetOptions((await publicFacetRows()).filter(row => row.id !== itemId));
}

export async function getKeywordLabels(terms: string[], lang: string): Promise<Record<string, string>> {
  if (!terms.length) return {};
  const db = await createServerSupabase();
  const { data, error } = await db.from('keywords').select('term, keyword_translations(lang,label)').in('term', terms);
  if (error) throw error;
  const labels: Record<string, string> = {};
  for (const row of data ?? []) {
    const translated = row.keyword_translations.find((entry: { lang: string; label: string }) => entry.lang === lang);
    // BY DESIGN: without a translation row the keyword keeps its original name.
    if (translated) labels[row.term] = translated.label;
  }
  return labels;
}
