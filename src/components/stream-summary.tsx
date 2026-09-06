import Link from 'next/link';
import { COMMUNITY_COLORS, FOUNDING_STREAMS } from '@/lib/communities';
import { RingMark } from '@/components/primitives';
import { Reveal } from '@/components/reveal';
import { type Community } from '@/lib/types';
import { getMessages } from '@/lib/i18n';
import { communityKey } from '@/lib/i18n/labels';

/**
 * The four streams, as four counts you can click.
 *
 * "Four Streams, One River" is the Center's founding sentence, and until now it
 * appeared on the portal only as a three-pixel rule under the masthead — true,
 * measured, and easy to miss. Here it is the first thing on the page: how much
 * of the archive each community holds, and a way straight into it.
 *
 * General India is deliberately absent. It is a real catalogue value and not
 * one of the four the Center names, so it belongs in the filters rather than in
 * the sentence.
 */
export async function StreamSummary({
  counts,
  active,
}: {
  counts: Record<Community, number>;
  active?: Community;
}) {
  const { t } = await getMessages();
  const total = FOUNDING_STREAMS.reduce((sum, c) => sum + (counts[c] ?? 0), 0);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {FOUNDING_STREAMS.map((community, index) => {
        const count = counts[community] ?? 0;
        const share = total === 0 ? 0 : Math.round((count / total) * 100);
        const on = active === community;

        return (
          <Reveal key={community} delay={index * 70} from="scale">
            <Link
              href={on ? '/portal' : `/portal?community=${community}`}
              aria-pressed={on}
              className={[
                'card card-interactive flex h-full flex-col items-center gap-3 px-4 py-6 text-center',
                on ? 'border-accent-strong bg-accent-wash/60' : '',
              ].join(' ')}
            >
              <RingMark color={COMMUNITY_COLORS[community]} size={54}>
                <span
                  className="font-mono text-lg font-medium"
                  style={{ color: COMMUNITY_COLORS[community] }}
                >
                  {count}
                </span>
              </RingMark>

              <span className="font-display text-lg leading-tight">
                {t(communityKey(community))}
              </span>

              {/*
                  Named for what it actually measures.

                  It read "% of the archive" while the denominator is the four
                  founding streams — so on a page whose header says nine records
                  are published, Baghdadi's five showed as 71%, which is 5/7.
                  The word "archive" meant two different things two lines apart.
                  The denominator is right and the label was wrong: this block is
                  about the four streams by design, and General India belongs in
                  the filters rather than in the sentence.
              */}
              <span className="eyebrow">
                {total === 0 ? t('streams.noneYet') : t('streams.share', { share })}
              </span>
            </Link>
          </Reveal>
        );
      })}
    </div>
  );
}
