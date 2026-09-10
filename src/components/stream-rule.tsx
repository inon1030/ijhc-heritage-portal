import { COMMUNITY_COLORS, COMMUNITY_ORDER, FOUNDING_STREAMS } from '@/lib/communities';
import { type Community } from '@/lib/types';
import { communityKey } from '@/lib/i18n/labels';
import { getMessages } from '@/lib/i18n';

/**
 * The signature element: one rule, four segments, sized by how much of the
 * archive each community actually holds.
 *
 * "Four Streams, One River" is the organisation's founding idea, so it is
 * rendered as live data rather than printed as a tagline. An archive with
 * nothing published yet shows the four founding streams in equal parts — an
 * honest empty state, not a hidden one.
 *
 * A fifth segment, General India, appears only once something is filed there.
 * It is not one of the founding four and does not pad the empty state.
 */
export async function StreamRule({ counts }: { counts: Record<Community, number> }) {
  const { t } = await getMessages();
  const total = COMMUNITY_ORDER.reduce((sum, c) => sum + (counts[c] ?? 0), 0);
  const label =
    total === 0
      ? t('streams.nothingPublished')
      : COMMUNITY_ORDER.filter((c) => counts[c] > 0)
          .map((c) => `${t(communityKey(c))} ${counts[c]}`)
          .join(', ');

  // Five segments now, since General India was added on 2026-08-27. It sits
  // last and it is the only one that can be empty without meaning the archive
  // is empty, so an empty archive still divides by the four founding streams.
  const emptyShare = 100 / FOUNDING_STREAMS.length;

  return (
    <div className="flex h-[4px] w-full" role="img" aria-label={label}>
      {COMMUNITY_ORDER.map((community) => {
        const count = counts[community] ?? 0;
        if (total > 0 && count === 0) return null;
        const share = total === 0 ? emptyShare : (count / total) * 100;
        return (
          <div
            key={community}
            className="h-full transition-[flex-grow] duration-700 ease-out"
            style={{
              flexGrow: Math.max(share, total === 0 ? emptyShare : 2),
              flexBasis: 0,
              backgroundColor: COMMUNITY_COLORS[community],
            }}
          />
        );
      })}
    </div>
  );
}
