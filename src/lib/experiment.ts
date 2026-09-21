/**
 * A/B testing, without a vendor and without a second network request.
 *
 * ── how it works ────────────────────────────────────────────────────────────
 *
 * Every visitor is put in one of a hundred buckets, once, by the proxy — a
 * number in a cookie, nothing else, no identifier and nothing to join against.
 * An experiment then divides those buckets: `variantFor('hero-copy')` hashes
 * the experiment's name with the bucket, so two experiments running at the same
 * time split the audience differently rather than testing the same half twice.
 *
 * The assignment is stable for a visitor, and it happens on the server, so the
 * page is rendered once in its variant. Nothing flickers between A and B, which
 * is the fault that makes most client-side testing tools worse than the thing
 * they are measuring.
 *
 * ── what it does not do ─────────────────────────────────────────────────────
 *
 * It does not decide anything for you. The result is readable only where the
 * visitor agreed to measurement and a GA4 id is configured: the bucket goes out
 * as a user property, and `track()` sends the event you care about. With
 * neither, both variants still render — the archive simply learns nothing,
 * which is the correct behaviour for a site with no measurement configured.
 *
 * And it is worth being blunt about arithmetic before running one: at the
 * traffic this archive has today, a difference smaller than very large will
 * never reach significance. An experiment that cannot conclude is a worse
 * choice than picking the better-written option and moving on.
 */

export const EXPERIMENT_COOKIE = 'ijhc.exp';

/** Buckets, not people. A hundred is enough to split and still be coarse. */
export const BUCKETS = 100;

export type Variant = 'a' | 'b';

/**
 * Stable, and seeded by the experiment's own name so two tests do not split the
 * audience along the same line.
 *
 * The first version added the name's hash to the bucket and took the parity —
 * which meant every experiment whose hash was even produced *exactly* the same
 * halves as every other even one. Two tests running at once would then have
 * been measuring the same people twice, and neither result could have been read
 * on its own. The unit test caught it; this hashes the pair instead, with FNV-1a
 * over `name:bucket`.
 */
export function variantOf(experiment: string, bucket: number): Variant {
  const seed = `${experiment}:${bucket}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  /*
   * The last step, and it is not decoration.
   *
   * FNV's lowest bit does not mix: the multiplier is odd, so each round
   * preserves the parity it was given, and the parity of the whole digest ends
   * up being the parity of the characters XORed together. Two experiment names
   * whose letters happen to sum the same parity then produce *identical*
   * splits — measured: `hero-copy` and `upload-prompt` agreed on all hundred
   * buckets. This avalanche spreads the high bits down before the coin is read.
   */
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995) >>> 0;
  hash ^= hash >>> 15;

  return hash % 2 === 0 ? 'a' : 'b';
}
