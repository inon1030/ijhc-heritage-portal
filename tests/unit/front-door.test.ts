import { describe, expect, it } from 'vitest';
import { CORRIDOR, WALL, frontDoor } from '@/lib/items/front-door';

/**
 * What the front door shows, at every size of archive it will ever be.
 *
 * The interesting cases are the two ends: the day it holds nothing, and the day
 * it holds more than the wall can show. Both have to look deliberate, and
 * neither is a state anybody will be around to check by hand.
 */

const image = (id: string) => ({
  id,
  file: { id: `f-${id}`, mime_type: 'image/jpeg', preview_path: null },
}) as never;

const recording = (id: string) => ({
  id,
  file: { id: `f-${id}`, mime_type: 'audio/mpeg', preview_path: null },
}) as never;

const many = (n: number, make = image) => Array.from({ length: n }, (_, i) => make(`i${i}`));

describe('the wall', () => {
  it('is a hundred plates whether or not there are a hundred records', () => {
    for (const held of [0, 1, 8, 99, 100, 240]) {
      const { wall } = frontDoor(many(held));
      expect(wall, `${held} records`).toHaveLength(WALL);
    }
  });

  it('puts every real photograph before any empty one', () => {
    const { wall, real } = frontDoor(many(8));
    expect(real).toBe(8);
    expect(wall.slice(0, 8).every((p) => p.src)).toBe(true);
    expect(wall.slice(8).every((p) => p.src === null)).toBe(true);
  });

  it('takes the first hundred in the portal order and nothing beyond', () => {
    // The portal returns newest first, so this is the hundred a visitor would
    // see at the top of it. There is no stored list: a record published a
    // minute ago is here, and one taken out of view is not, because it is the
    // same query.
    const { wall, real } = frontDoor(many(240));
    expect(real).toBe(WALL);
    expect(wall.every((p) => p.src)).toBe(true);
    expect(wall[0].key).toBe('i0');
    expect(wall[WALL - 1].key).toBe(`i${WALL - 1}`);
  });

  it('counts only images, because a recording is not a picture of anything', () => {
    const mixed = [image('a'), recording('b'), image('c'), recording('d')];
    const { real, wall } = frontDoor(mixed);
    expect(real).toBe(2);
    expect(wall.slice(0, 2).map((p) => p.key)).toEqual(['a', 'c']);
  });
});

describe('the corridor', () => {
  it('never shows a hundred photographs in four seconds', () => {
    const { corridor } = frontDoor(many(240));
    expect(corridor).toHaveLength(CORRIDOR);
  });

  it('walks the whole pool as the clock moves', () => {
    // A fixed fourteen would mean the hundredth photograph published is never
    // seen by anybody who does not click through.
    const items = many(100);
    const minute = 60_000;
    const seen = new Set<string>();
    for (let m = 0; m < 20; m++) {
      for (const plate of frontDoor(items, m * minute).corridor) seen.add(plate.key);
    }
    expect(seen.size).toBe(100);
  });

  it('is the same corridor twice in the same minute', () => {
    // On a clock rather than at random, so a server rendering the page twice
    // renders the same page.
    const items = many(60);
    // Both inside minute 16: 1_000_000ms is 16m40s and 1_010_000ms is 16m50s.
    const a = frontDoor(items, 1_000_000).corridor.map((p) => p.key);
    const b = frontDoor(items, 1_010_000).corridor.map((p) => p.key);
    expect(a).toEqual(b);

    // And a different corridor in the next minute.
    const c = frontDoor(items, 1_070_000).corridor.map((p) => p.key);
    expect(c).not.toEqual(a);
  });

  it('pads a nearly empty archive rather than looking broken', () => {
    const { corridor } = frontDoor(many(2));
    expect(corridor.length).toBeGreaterThanOrEqual(9);
    expect(corridor.filter((p) => p.src)).toHaveLength(2);
  });

  it('puts the empty mounts at the far end, so the passage ends on a photograph', () => {
    // The corridor runs from the distant past to the present. Padding at the
    // near end meant the last thing before arriving at now was a blank plate.
    const { corridor } = frontDoor(many(3));
    expect(corridor.at(-1)?.src).toBeTruthy();
    expect(corridor[0].src).toBeNull();
    expect(corridor.slice(-3).every((p) => p.src)).toBe(true);
  });

  it('shows nothing at all when the archive has no photographs', () => {
    // The headline carries the page on its own, which is the existing
    // behaviour of the wall and is deliberate: an introduction to an empty
    // archive is a lie about it.
    expect(frontDoor([]).corridor).toEqual([]);
    expect(frontDoor(many(3, recording)).corridor).toEqual([]);
  });
});
