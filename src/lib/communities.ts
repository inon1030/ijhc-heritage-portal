import type { Community } from './types';

/**
 * A colour per community, taken from each one's own material world rather than
 * from a generic palette:
 *
 *   Bene Israel   indigo, for the Konkan coast dye trade
 *   Cochin        the blue and white of the Paradesi synagogue's painted tiles
 *   Baghdadi      madder red, for the Sassoon textile houses
 *   Bnei Menashe  the green of the Manipur and Mizoram hills
 *   General India slate, the quietest of the five: filed as Indian Jewish
 *                 without a stream, and the colour claims no more than that
 *
 * Used for the proportional rule under the masthead and to mark every record.
 */
export const COMMUNITY_COLORS: Record<Community, string> = {
  bene_israel: 'var(--color-bene)',
  cochin: 'var(--color-cochin)',
  baghdadi: 'var(--color-baghdadi)',
  bnei_menashe: 'var(--color-menashe)',
  general_india: 'var(--color-general)',
};

export const COMMUNITY_ORDER: Community[] = [
  'bene_israel',
  'cochin',
  'baghdadi',
  'bnei_menashe',
  'general_india',
];

/**
 * The four the Center names in "Four Streams, One River". `general_india` is a
 * real, choosable value but not one of the founding four, so anything that
 * speaks about the streams as an idea uses this list instead.
 */
export const FOUNDING_STREAMS: Community[] = [
  'bene_israel',
  'cochin',
  'baghdadi',
  'bnei_menashe',
];

/**
 * A counter with every community at zero.
 *
 * Two places used to spell the four keys out by hand, and adding a fifth
 * community broke both — which the type checker caught, but only because the
 * shape is exhaustive. Deriving it means the next addition breaks nothing.
 */
export function emptyCommunityCounts(): Record<Community, number> {
  return Object.fromEntries(COMMUNITY_ORDER.map((c) => [c, 0])) as Record<Community, number>;
}
