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

/**
 * The corridor's length is no longer a constant.
 *
 * The whole passage is capped at four seconds, and the beat spent waiting for
 * photographs comes out of that rather than being added to it — so the corridor
 * gets whatever is left, between a floor of 2.2 seconds and about 3.5. Every
 * assertion below therefore has to hold across that range, not at one value.
 */
const RUNS = [2200, 2600, 3000, 3520];

describe('the passage lays its photographs out', () => {
  it('never starts one before the run does, at any length of run', () => {
    for (const travel of RUNS)
      for (const count of COUNTS) {
        const { cues } = passageCues(count, travel);
        // Within a millisecond of zero: the first photograph begins exactly as
        // the run does, and the component rounds to whole milliseconds anyway.
        expect(cues[0].delay, `${count} photographs over ${travel}ms`).toBeCloseTo(0, 6);
      }
  });

  it('gives every one of them the same span, in order', () => {
    const { cues } = passageCues(9, 3000);
    const gaps = cues.slice(1).map((cue, i) => cue.delay - cues[i].delay);

    for (const gap of gaps) {
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeCloseTo(gaps[0], 6);
    }
  });

  it('reaches the last one before the run ends', () => {
    for (const run of RUNS)
      for (const count of COUNTS) {
        const { travel, cues } = passageCues(count, run);
        const last = cues[cues.length - 1];
        expect(last.depth, `${count} photographs over ${run}ms`).toBeLessThan(travel);
      }
  });

  it('spaces them out as more are published rather than crowding them', () => {
    const few = passageCues(4, 3000);
    const many = passageCues(16, 3000);

    // A longer corridor, walked in the same four seconds: more photographs
    // means they come faster, not that the introduction gets longer.
    expect(many.travel).toBeGreaterThan(few.travel);

    const between = (r: ReturnType<typeof passageCues>) => r.cues[1].delay - r.cues[0].delay;
    expect(between(many)).toBeLessThan(between(few));
  });

  it('copes with an archive that has published one photograph, or none', () => {
    expect(passageCues(0, 3000).cues).toEqual([]);
    expect(passageCues(0, 3000).travel).toBeGreaterThan(0);

    const one = passageCues(1, 3000);
    expect(one.cues).toHaveLength(1);
    expect(Math.round(one.cues[0].delay)).toBe(0);
  });
});

describe('a photograph gets a proportion of the corridor, not a fixed span', () => {
  it('shortens every span when the run is shortened', () => {
    // The hold spends out of the four seconds, so a slow connection gives a
    // shorter corridor. A fixed span against a shortened run would put the
    // whole archive on screen at once.
    const long = passageCues(10, 3520);
    const short = passageCues(10, 2200);

    expect(short.frameLife).toBeLessThan(long.frameLife);
    expect(short.frameLife / 2200).toBeCloseTo(long.frameLife / 3520, 2);
  });
});
