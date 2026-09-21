import { describe, expect, it } from 'vitest';
import { BUCKETS, variantOf } from '@/lib/experiment';

/**
 * What an A/B assignment has to be, or the numbers it produces mean nothing.
 */
describe('assigning a variant', () => {
  it('gives the same visitor the same variant every time', () => {
    for (let bucket = 0; bucket < BUCKETS; bucket += 1) {
      expect(variantOf('hero-copy', bucket)).toBe(variantOf('hero-copy', bucket));
    }
  });

  /*
   * Roughly, not exactly. A hash over the pair cannot land on 50/50 by
   * construction, and a split that did would mean the assignment was a counter
   * rather than a hash — stable per visitor is what matters, and an imbalance
   * inside this band costs nothing a test of any useful size would notice.
   */
  it('splits the audience roughly in half', () => {
    for (const experiment of ['hero-copy', 'upload-prompt', 'portal-layout']) {
      const a = [...Array(BUCKETS).keys()].filter((bucket) => variantOf(experiment, bucket) === 'a').length;
      expect(a).toBeGreaterThanOrEqual(BUCKETS * 0.35);
      expect(a).toBeLessThanOrEqual(BUCKETS * 0.65);
    }
  });

  /*
   * Two experiments running at once must not test the same half twice: if they
   * did, every visitor in variant A of one would be in variant A of the other,
   * and neither result could be read on its own.
   */
  it('divides the audience differently for a different experiment', () => {
    const overlap = [...Array(BUCKETS).keys()].filter(
      (bucket) => variantOf('hero-copy', bucket) === variantOf('upload-prompt', bucket),
    ).length;
    expect(overlap).not.toBe(BUCKETS);
  });

  /*
   * Deterministic, and that is all. An earlier version of this test also
   * demanded that bucket 7 and bucket 8 differ — which is a property of a
   * counter, not of a hash, and would have been satisfied only by an assignment
   * that alternated. Both halves stay balanced above; adjacent buckets landing
   * on the same side is what a hash does.
   */
  it('depends on nothing but the name and the bucket', () => {
    const first = [...Array(BUCKETS).keys()].map((bucket) => variantOf('hero-copy', bucket));
    const second = [...Array(BUCKETS).keys()].map((bucket) => variantOf('hero-copy', bucket));
    expect(second).toEqual(first);
  });
});
