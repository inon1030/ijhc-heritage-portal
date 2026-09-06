import 'server-only';
import { fileKind } from '@/lib/files/validate';
import { viewableUrl } from '@/lib/files/urls';
import type { Item, ItemFile } from '@/lib/types';

/**
 * What the front door draws itself from.
 *
 * The home page shows the archive twice: as a wall of a hundred thumbnails
 * behind the headline, and as a corridor of photographs the visitor travels
 * through on arrival. Both are the same material, and both have to look
 * deliberate on the day the archive holds eight records and on the day it holds
 * eight hundred. This works out what each of them gets.
 *
 * ── the hundred ─────────────────────────────────────────────────────────────
 *
 * The wall is the first hundred images in the portal, in the portal's own
 * order — newest first. Nothing maintains that list: it is a query, so a record
 * published a minute ago is in it, and a record taken out of public view falls
 * out of it and the next one down takes its place. There is no set to keep in
 * step with anything.
 *
 * ── the empty mounts ────────────────────────────────────────────────────────
 *
 * Below a hundred the wall is padded. **Not with photographs.** A picture of
 * Indian Jewish life that no family gave the archive is a claim the archive
 * cannot make — a visitor cannot tell a decorative one from a holding, the page
 * beside it says every record here was checked by a person, and a stock
 * photograph was removed from this archive today for exactly that reason.
 *
 * So the padding is empty mounts: blank archival plates, obviously not
 * pictures. They fill the wall the way unhung frames fill a gallery that is
 * still collecting, and every one of them is a space waiting for something
 * somebody still has in a drawer — which is the campaign the Center is running.
 * They disappear one at a time as real records are published.
 */

/** How many the wall holds when the archive is full enough to fill it. */
export const WALL = 100;

/**
 * How many photographs the corridor passes through.
 *
 * Not a hundred. The corridor is four seconds long, and a hundred photographs
 * in four seconds is a flicker — forty milliseconds each, which is below the
 * point at which a picture becomes a picture rather than a flash. Fourteen is
 * about one every three hundred milliseconds, which is a rhythm you can watch.
 * The wall is where all hundred are.
 */
export const CORRIDOR = 14;

/** Never fewer than this on the corridor, padded with empty mounts if need be. */
const CORRIDOR_FLOOR = 9;

export interface Plate {
  key: string;
  /** Null on an empty mount. */
  src: string | null;
}

export interface FrontDoor {
  /** Exactly WALL entries once the archive can fill it; padded before that. */
  wall: Plate[];
  /** What the passage travels through. Real photographs first, always. */
  corridor: Plate[];
  /** How many of the wall are real. Drives the grid's density. */
  real: number;
}

type WithFile = Item & { file: ItemFile | null };

export function frontDoor(items: WithFile[], now = Date.now()): FrontDoor {
  const photographs = items
    .filter((item) => item.file && fileKind(item.file.mime_type) === 'image')
    .slice(0, WALL)
    .map((item) => ({ key: item.id, src: viewableUrl(item.file!) }));

  const wall: Plate[] = [...photographs];
  for (let i = photographs.length; i < WALL; i++) {
    wall.push({ key: `empty-${i}`, src: null });
  }

  return {
    wall,
    corridor: corridorFrom(photographs, now),
    real: photographs.length,
  };
}

/**
 * Fourteen of the hundred, and a different fourteen as the hour goes on.
 *
 * A fixed fourteen would mean the ninety-nineth photograph published is never
 * seen by anybody who does not click through, and that the corridor looks the
 * same on every visit. The window walks the pool on a clock instead: the whole
 * archive passes through the front door over about eight minutes, and two
 * people arriving at different moments are shown different material.
 *
 * On a clock and not at random, so that the page a server renders is the page
 * it would render again a second later — which is the difference between
 * something testable and something that has to be watched.
 */
function corridorFrom(photographs: Plate[], now: number): Plate[] {
  if (photographs.length === 0) return [];

  const take = Math.min(CORRIDOR, photographs.length);
  const start = photographs.length ? (Math.floor(now / 60_000) * take) % photographs.length : 0;

  const chosen: Plate[] = [];
  for (let i = 0; i < take; i++) {
    chosen.push(photographs[(start + i) % photographs.length]);
  }

  /*
   * Padding goes at the *far* end, not the near one.
   *
   * The corridor is travelled from the distant past towards the present, so
   * appending the empty mounts put them last and the passage ended on blanks —
   * the final thing before arriving at now was nothing at all. At the far end
   * they read the way they ought to: the deep past is unhung frames, and the
   * closer you come to the present the more there is on the walls. Which is
   * true, and is the argument the Center is making.
   *
   * Real photographs are never displaced by these; they only ever precede them.
   */
  const padding: Plate[] = [];
  for (let i = chosen.length; i < CORRIDOR_FLOOR; i++) {
    padding.push({ key: `empty-${i}`, src: null });
  }

  return [...padding, ...chosen];
}
