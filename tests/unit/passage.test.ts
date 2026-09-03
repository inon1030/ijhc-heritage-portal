import { describe, expect, it } from 'vitest';
import { passageCues } from '@/components/time-passage';

/**
 * The corridor's arithmetic.
 *
 * This exists because the same mistake was made twice by eye. The camera moves
 * at a constant speed past photographs laid out along a helix, and each one is
 * given a fixed span on screen ending at the moment the camera reaches it. Get
 * the head start wrong and the opening photographs arrive already half faded —
 * which is exactly what the first build did to three of its eight, and which
 * looks like a bug in the images rather than in a number.
 *
 * The archive's holdings grow every time a volunteer publishes something, so
 * the count is not a fixed thing anybody will come back and retune. These
 * assertions hold for every count instead of for the one that happened to be
 * live the day it was written.
 */

const COUNTS = [1, 2, 3, 5, 8, 12, 18, 30];

describe('the passage lays its photographs out', () => {
  it('never starts one before the run does', () => {
    for (const count of COUNTS) {
      const { cues } = passageCues(count);
      // Within a millisecond of zero: the first photograph begins exactly as
      // the run does, and the component rounds to whole milliseconds anyway.
      expect(cues[0].delay, `${count} photographs`).toBeCloseTo(0, 6);
    }
  });

  it('gives every one of them the same span, in order', () => {
    const { cues } = passageCues(9);
    const gaps = cues.slice(1).map((cue, i) => cue.delay - cues[i].delay);

    for (const gap of gaps) {
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeCloseTo(gaps[0], 6);
    }
  });

  it('reaches the last one before the run ends', () => {
    for (const count of COUNTS) {
      const { travel, cues } = passageCues(count);
      const last = cues[cues.length - 1];
      expect(last.depth, `${count} photographs`).toBeLessThan(travel);
    }
  });

  it('spaces them out as more are published rather than crowding them', () => {
    const few = passageCues(4);
    const many = passageCues(16);

    // A longer corridor, walked in the same four seconds: more photographs
    // means they come faster, not that the introduction gets longer.
    expect(many.travel).toBeGreaterThan(few.travel);

    const between = (r: ReturnType<typeof passageCues>) => r.cues[1].delay - r.cues[0].delay;
    expect(between(many)).toBeLessThan(between(few));
  });

  it('copes with an archive that has published one photograph, or none', () => {
    expect(passageCues(0).cues).toEqual([]);
    expect(passageCues(0).travel).toBeGreaterThan(0);

    const one = passageCues(1);
    expect(one.cues).toHaveLength(1);
    expect(Math.round(one.cues[0].delay)).toBe(0);
  });
});
