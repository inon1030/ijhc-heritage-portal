import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import type { Contributor, Family } from '@/lib/types';

/**
 * The contributor register.
 *
 * One row per person who has sent the archive something, or whom a volunteer
 * has recorded as belonging to a family. Everything here runs through the
 * caller's session, so `is_volunteer()` decides: an anonymous visitor and a
 * pending account read nothing, whatever this code asks for.
 *
 * Family links are the point of it. A surname on a photograph is a guess; an
 * address a volunteer has already tied to the Sassoons is a fact the archive
 * recorded, and the next thing that address sends arrives with that already
 * known.
 */

export interface ContributorRow extends Contributor {
  familyIds: string[];
  submissions: number;
}

/** Everyone in the register, with their family links and how much they have sent. */
export async function listContributors(): Promise<ContributorRow[]> {
  const supabase = await createServerSupabase();

  const [people, links, counts] = await Promise.all([
    supabase.from('contributors').select('*').order('email'),
    supabase.from('contributor_families').select('contributor_id, family_id'),
    supabase.from('items').select('contributor_id').not('contributor_id', 'is', null),
  ]);

  if (people.error) throw people.error;
  if (links.error) throw links.error;
  if (counts.error) throw counts.error;

  const byContributor = new Map<string, string[]>();
  for (const link of (links.data ?? []) as { contributor_id: string; family_id: string }[]) {
    byContributor.set(link.contributor_id, [
      ...(byContributor.get(link.contributor_id) ?? []),
      link.family_id,
    ]);
  }

  // Counted here rather than with a grouped query: PostgREST has no GROUP BY,
  // and the register is people, not records — it stays small.
  const submissions = new Map<string, number>();
  for (const row of (counts.data ?? []) as { contributor_id: string }[]) {
    submissions.set(row.contributor_id, (submissions.get(row.contributor_id) ?? 0) + 1);
  }

  return ((people.data ?? []) as Contributor[]).map((person) => ({
    ...person,
    familyIds: byContributor.get(person.id) ?? [],
    submissions: submissions.get(person.id) ?? 0,
  }));
}

/** One contributor, with the families they belong to. Null when RLS says nothing. */
export async function getContributor(
  id: string,
): Promise<(Contributor & { families: Family[]; submissions: number }) | null> {
  const supabase = await createServerSupabase();

  const [person, links, count] = await Promise.all([
    supabase.from('contributors').select('*').eq('id', id).maybeSingle(),
    supabase.from('contributor_families').select('families(*)').eq('contributor_id', id),
    supabase.from('items').select('id', { count: 'exact', head: true }).eq('contributor_id', id),
  ]);

  if (person.error) throw person.error;
  if (!person.data) return null;
  if (links.error) throw links.error;
  if (count.error) throw count.error;

  const families = ((links.data ?? []) as { families: Family | Family[] | null }[])
    .flatMap((row) => (Array.isArray(row.families) ? row.families : row.families ? [row.families] : []))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { ...(person.data as Contributor), families, submissions: count.count ?? 0 };
}

/**
 * Finds the person this address belongs to, creating the row if the archive has
 * not seen them before.
 *
 * The unique index is on `lower(btrim(email))`, an expression, and PostgREST's
 * upsert needs a plain unique column — so the read comes first and the insert
 * second. The 23505 branch is the two-volunteers-at-once case: the row that
 * beat us is the row we wanted, so we take it rather than failing.
 *
 * `fullName` only ever fills a blank. A volunteer who typed a correction should
 * not have it overwritten by the next upload that leaves the name empty, and a
 * contributor who gives a different name later is a question for a person, not
 * something to resolve silently.
 */
export async function findOrCreateContributor(
  email: string,
  fullName: string | null,
): Promise<Contributor> {
  const supabase = await createServerSupabase();
  const normalised = email.trim().toLowerCase();

  const existing = await supabase
    .from('contributors')
    .select('*')
    .eq('email', normalised)
    .maybeSingle();

  if (existing.error) throw existing.error;

  if (existing.data) {
    const person = existing.data as Contributor;
    if (fullName?.trim() && !person.full_name) {
      const { data } = await supabase
        .from('contributors')
        .update({ full_name: fullName.trim() })
        .eq('id', person.id)
        .select()
        .maybeSingle();
      return (data as Contributor) ?? person;
    }
    return person;
  }

  const created = await supabase
    .from('contributors')
    .insert({ email: normalised, full_name: fullName?.trim() || null })
    .select()
    .single();

  if (created.error) {
    if ((created.error as { code?: string }).code === '23505') {
      const retry = await supabase.from('contributors').select('*').eq('email', normalised).single();
      if (retry.error) throw retry.error;
      return retry.data as Contributor;
    }
    throw created.error;
  }

  return created.data as Contributor;
}

/**
 * The same thing, on the submission path.
 *
 * A contributor is a member of the public with no session, and the register is
 * `is_volunteer()` — so the session client would be refused here for exactly
 * the reason it should be. This runs with the service-role client, as
 * `createItem` does and for the same reason: anonymous contribution is a
 * product requirement while the anon role holds no write permission anywhere.
 *
 * It writes an address and a name and nothing else. It cannot link a family,
 * which is a volunteer's judgement, not a form field.
 */
export async function registerContributor(
  email: string,
  fullName: string | null,
): Promise<Contributor> {
  const { createAdminSupabase } = await import('@/lib/supabase/admin');
  const admin = createAdminSupabase();
  const normalised = email.trim().toLowerCase();

  const existing = await admin
    .from('contributors')
    .select('*')
    .eq('email', normalised)
    .maybeSingle();

  if (existing.error) throw existing.error;

  if (existing.data) {
    const person = existing.data as Contributor;
    // Only ever fills a blank — see findOrCreateContributor.
    if (fullName?.trim() && !person.full_name) {
      const { data } = await admin
        .from('contributors')
        .update({ full_name: fullName.trim() })
        .eq('id', person.id)
        .select()
        .maybeSingle();
      return (data as Contributor) ?? person;
    }
    return person;
  }

  const created = await admin
    .from('contributors')
    .insert({ email: normalised, full_name: fullName?.trim() || null })
    .select()
    .single();

  if (created.error) {
    if ((created.error as { code?: string }).code === '23505') {
      const retry = await admin.from('contributors').select('*').eq('email', normalised).single();
      if (retry.error) throw retry.error;
      return retry.data as Contributor;
    }
    throw created.error;
  }

  return created.data as Contributor;
}

/** Records that an address belongs to a family. Idempotent. */
export async function linkContributorToFamily(contributorId: string, familyId: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('contributor_families')
    .upsert({ contributor_id: contributorId, family_id: familyId }, { ignoreDuplicates: true });

  if (error) throw error;
}

/** Takes the link back. The contributor and the family both remain. */
export async function unlinkContributorFromFamily(contributorId: string, familyId: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('contributor_families')
    .delete()
    .eq('contributor_id', contributorId)
    .eq('family_id', familyId);

  if (error) throw error;
}

/**
 * Corrects a mistyped address.
 *
 * A volunteer's act, not an administrator's: the person who notices is the one
 * whose reply bounced, and correcting a typo is cataloguing. `contributors`
 * has one row per address, so the correction may collide with somebody the
 * archive already knows — 23505 is that, and it is a real answer rather than a
 * failure: the two are the same person and the records should be pointed at
 * the row that already exists.
 */
export async function setContributorEmail(id: string, email: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('contributors')
    .update({ email: email.trim().toLowerCase() })
    .eq('id', id);

  if (error) throw error;
}

/**
 * Forgets a person and keeps their material.
 *
 * The handling notice promises a contributor they can ask what is held about
 * them and ask for it to be removed. Until migration 0022 neither request
 * could be honoured through the interface at all.
 *
 * `items.contributor_id` is `ON DELETE SET NULL`, so the records this person
 * sent keep their scans, their catalogue and their place in the archive, and
 * lose only the link to a named human being. Withdrawing the *material* is a
 * different request and the bin answers it.
 *
 * Administrators only, enforced by `contributors_admin_delete`. This function
 * does not check the role — RLS does, and a volunteer calling it deletes
 * nothing and gets a count of zero.
 */
export async function eraseContributor(id: string): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { error, count } = await supabase
    .from('contributors')
    .delete({ count: 'exact' })
    .eq('id', id);

  if (error) throw error;
  return Boolean(count);
}

/** Corrects a name a volunteer has better information about. */
export async function setContributorName(id: string, fullName: string | null) {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('contributors')
    .update({ full_name: fullName?.trim() || null })
    .eq('id', id);

  if (error) throw error;
}
