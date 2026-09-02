import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { serviceRoleKey } from '@/lib/env';

/**
 * Proof that the caller is the one who created this storage path.
 *
 * `/api/analyze` and `/api/items` both take a storage path and act on it —
 * one reads the object and sends it to a paid model, the other attaches it to
 * a record. Neither could tell whose path it was. The only thing standing
 * between an anonymous caller and any object in the bucket was the uuid in the
 * key, which is a capability URL pretending to be an access control.
 *
 * Two concrete harms that closes:
 *
 *   - an attacker who minted one path could loop `/api/analyze` on it forever,
 *     or on any other path they learned, and read back its OCR text
 *   - an attacker could attach *someone else's* storage path to their own
 *     submission, and if a volunteer published it, that file became public
 *
 * So the path is signed when it is minted and the signature is required
 * wherever it is spent. Short-lived, because a contribution is a single
 * sitting: sign, upload, read, submit.
 *
 * The key is derived from the service-role key rather than being a new secret
 * of its own. That key is already server-only, already required for the app to
 * function at all, and already rotated as one unit — adding a second secret
 * would mean a second thing to configure and a second thing to forget.
 */

const TTL_MS = 60 * 60 * 1000;

function secret(): Buffer {
  return createHmac('sha256', serviceRoleKey()).update('upload-grant/v1').digest();
}

export interface Grant {
  grant: string;
  expiresAt: number;
}

/** Signs one storage path. */
export function grantFor(path: string, expiresAt: number): string {
  return createHmac('sha256', secret()).update(`${path}\n${expiresAt}`).digest('base64url');
}

/** A fresh grant for a path just created. */
export function issueGrant(path: string): Grant {
  const expiresAt = Date.now() + TTL_MS;
  return { grant: grantFor(path, expiresAt), expiresAt };
}

/**
 * Is this a path this server handed out, and is it still current?
 *
 * Compared with `timingSafeEqual` so the check cannot be walked one byte at a
 * time. Length is compared first because `timingSafeEqual` throws on a
 * mismatch rather than returning false.
 */
export function verifyGrant(path: string, expiresAt: unknown, grant: unknown): boolean {
  if (typeof grant !== 'string' || typeof expiresAt !== 'number') return false;
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expected = Buffer.from(grantFor(path, expiresAt));
  const given = Buffer.from(grant);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
