import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { serviceRoleKey } from '@/lib/env';

/**
 * A contributor's way back to what they sent.
 *
 * Until now there was none. Somebody uploaded their grandmother's photograph,
 * saw "Submitted for review", and that was the end of it: they could not learn
 * whether it had been published, whether it had been declined, or whether it
 * had arrived at all. The upload screen printed the first eight characters of
 * the record id and called it a "Reference", which looked like it meant
 * something and did not — nothing accepted it as input.
 *
 * The obvious fix is to email them a link, and the obvious fix costs money and
 * a decision that is not mine: Supabase's built-in mail is rate-limited to a
 * couple of messages an hour and is explicitly not for production, so it means
 * an SMTP account somebody has to create. This does not need one. The link is
 * handed over on screen at the moment of submission, and it works forever.
 *
 * ── what it is ──────────────────────────────────────────────────────────────
 *
 * A signed capability over one record id. It reveals exactly what its holder
 * already knows, because its holder is the person who typed it: the title,
 * the files, and where the record has got to. It is not an account and grants
 * no editing.
 *
 * **Unguessable, not secret.** 192 bits of HMAC is not brute-forceable, but a
 * link pasted into a group chat is a link anybody in that chat can open. That
 * is the correct trade for a receipt — the alternative is asking a member of
 * the public to hold a password — and it is why the page it opens shows a
 * submission's status and never a contributor's address.
 *
 * **No expiry, deliberately.** A grant expires in an hour because a
 * contribution is one sitting. This is the opposite: review takes as long as a
 * volunteer takes, and a receipt that died before the answer arrived would be
 * worse than no receipt.
 */

function secret(): Buffer {
  return createHmac('sha256', serviceRoleKey()).update('submission-receipt/v1').digest();
}

/** The token for one record. Stable: the same record always yields the same one. */
export function receiptFor(itemId: string): string {
  return createHmac('sha256', secret()).update(itemId).digest('base64url').slice(0, 32);
}

/** Constant-time, and length-checked first because timingSafeEqual throws on a mismatch. */
export function verifyReceipt(itemId: string, token: unknown): boolean {
  if (typeof token !== 'string' || !token) return false;

  const expected = Buffer.from(receiptFor(itemId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
