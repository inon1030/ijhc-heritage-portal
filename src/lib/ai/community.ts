import { COMMUNITIES, type Community } from '@/lib/types';

/**
 * Which shelf a record lands on when the model could not name a stream.
 *
 * There are two different unplaceables and they are not the same shelf:
 *
 *   General India   from India, Jewish, and nothing narrows it to a stream.
 *                   A real catalogue value with a real colour on the masthead.
 *   off-topic       not the archive's material at all — a holiday photograph,
 *                   a screenshot, a festival in Peru.
 *
 * They shared a shelf for one build and that was wrong. General India is the
 * fifth stripe under the masthead, it appears in the community filter, and its
 * count is a figure the Center shows people. A photograph of Cusco sitting in
 * it would make all three say something untrue.
 *
 * So off-topic material gets **no** community. Its own flag carries it, it
 * appears in its own group in the review queue, and a volunteer rejects it.
 *
 * **Applied after the gate, never asked of the model.** Same reasoning as
 * deriving the media branch from the MIME type: this is a filing convention,
 * not a reading. A model told "always answer something" learns to manufacture
 * the confidence that gets an answer through, which is the one thing the 70%
 * rule exists to stop. The prompt says the opposite — decline when nothing
 * supports a stream — and declining is what produces the catch-all.
 *
 * Either way it reaches `items.community` only when a reviewer adopts it.
 */
export function communityOrCatchAll(
  value: string | null | undefined,
  offTopic: boolean,
): Community | null {
  if ((COMMUNITIES as string[]).includes(value ?? '')) return value as Community;

  // Nothing that does not belong to the archive is given one of its shelves.
  return offTopic ? null : 'general_india';
}
