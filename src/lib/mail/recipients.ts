import type { UserRole } from '@/lib/types';

/**
 * Who is sent mail about an event, decided in one place (22.09.2026).
 *
 * Inon's rule, as he gave it:
 *
 *   a new submission   the person who sent it, and every knowledge expert or
 *                      administrator whose account is marked to hear about
 *                      new submissions.
 *   a publication      the knowledge expert who published it, every
 *                      administrator marked to hear about publications, and
 *                      the person who sent it.
 *
 * Pure functions over rows already read, so the rule can be tested without a
 * database and cannot drift between the two routes that use it. The reading is
 * in `watchers.ts`.
 *
 * Every address goes out in a message of its own. One message with twelve
 * addresses in To would hand every contributor's address to every moderator
 * and the other way round.
 */

export interface Watcher {
  email: string;
  role: UserRole;
  notify_uploads: boolean;
  notify_publications: boolean;
}

const norm = (email: string) => email.trim().toLowerCase();

/** Addresses in order, each once, compared without case or spaces. */
export function uniqueAddresses(addresses: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of addresses) {
    const email = raw?.trim();
    if (!email || seen.has(norm(email))) continue;
    seen.add(norm(email));
    out.push(email);
  }
  return out;
}

/** Moderators to tell about a new submission. The contributor gets their receipt instead. */
export function uploadRecipients(watchers: Watcher[], contributorEmail: string | null): string[] {
  const skip = contributorEmail ? norm(contributorEmail) : null;
  return uniqueAddresses(
    watchers
      .filter((w) => (w.role === 'volunteer' || w.role === 'admin') && w.notify_uploads)
      .map((w) => w.email),
  ).filter((email) => norm(email) !== skip);
}

/**
 * Moderators to tell about a publication: the one who published it first, then
 * the administrators who asked. The contributor gets their own notice instead,
 * so their address is left out here even when they are also a moderator.
 */
export function publicationRecipients(
  approverEmail: string | null,
  watchers: Watcher[],
  contributorEmail: string | null,
): string[] {
  const skip = contributorEmail ? norm(contributorEmail) : null;
  return uniqueAddresses([
    approverEmail,
    ...watchers.filter((w) => w.role === 'admin' && w.notify_publications).map((w) => w.email),
  ]).filter((email) => norm(email) !== skip);
}
