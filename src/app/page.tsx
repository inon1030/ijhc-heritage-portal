import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Upload } from 'lucide-react';
import { FilePreview } from '@/components/file-preview';
import { Logo } from '@/components/logo';
import { COMMUNITY_ORDER } from '@/lib/communities';
import { countPublishedItems, getCommunityCounts, listPublishedItems } from '@/lib/items/queries';
import { COMMUNITY_LABELS } from '@/lib/types';
import { fileKind } from '@/lib/files/validate';

export const metadata: Metadata = {
  title: 'Indian Jewish Heritage Center',
  description:
    'Two thousand years of Bene Israel, Cochin, Baghdadi and Bnei Menashe heritage. Browse the archive, or add something your family kept.',
};

/**
 * The front door.
 *
 * It follows the Center's own campaign artwork — the saffron 2,000, the blue
 * "Save it Now", the faded crowd behind them — with two changes that the poster
 * did not have to make and a website does.
 *
 * **The type is smaller.** A poster is read across a room and a home page is
 * read at arm's length; at poster proportions the headline would fill a laptop
 * screen and push the two things a visitor came to do below the fold. It is
 * still the largest thing on the page by a wide margin, and it still lands
 * before anything else does.
 *
 * **The crowd is the archive.** The poster's backdrop is a photograph of a
 * congregation. Rather than reproduce a picture of real people whose consent
 * the archive cannot vouch for, the wall behind the headline is the archive's
 * own published records — actual holdings, faded back, and every one of them
 * cleared by a volunteer before it could appear anywhere. It grows as the
 * archive does, which is the argument the page is making. Before there is
 * anything to show it is simply paper, and the headline carries the page alone.
 *
 * Two buttons and no more. Browsing and contributing are the whole of what a
 * visitor can do here; everything else — signing in, reviewing, the vocabulary,
 * approving an account — lives in the bar at the top, one hover away.
 */
export default async function Home() {
  const [items, counts, total] = await Promise.all([
    // The wall shows eighteen. Asking for the whole archive to render eighteen
    // thumbnails is the kind of query that is invisible at eight records and
    // painful at eight hundred.
    listPublishedItems({ limit: 40 }).catch(() => []),
    getCommunityCounts().catch(() => null),
    countPublishedItems().catch(() => 0),
  ]);

  const wall = items.filter((item) => item.file && fileKind(item.file.mime_type) === 'image').slice(0, 18);


  return (
    <div className="relative isolate overflow-hidden">
      {/* The wall. Decorative, so it is hidden from screen readers entirely —
          it is the same records that are listed properly one click away. */}
      {wall.length > 0 && (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 select-none">
          <div className="grid h-full w-full grid-cols-4 opacity-[0.13] sm:grid-cols-6 lg:grid-cols-9">
            {wall.map((item) => (
              <div key={item.id} className="aspect-square overflow-hidden">
                <FilePreview file={item.file} alt="" fit="cover" className="grayscale sepia-[0.35]" />
              </div>
            ))}
          </div>
          {/* Paper washing up over the wall, so the type never sits on an edge. */}
          <div className="absolute inset-0 bg-gradient-to-b from-paper via-paper/75 to-paper" />
        </div>
      )}

      <div className="mx-auto max-w-5xl px-6 pt-10 pb-16 sm:pt-16 sm:pb-20">
        <Link
          href="/portal"
          className="animate-rise inline-flex items-center gap-3 rounded-xl transition-transform duration-300 hover:-translate-y-0.5"
        >
          <Logo variant="lockup" size={54} />
          <span className="sr-only">Indian Jewish Heritage Center</span>
        </Link>

        {/*
          The headline, set as the poster sets it: the numeral carrying the
          line and the words stacked tight against its right shoulder. One
          heading element — "2,000 Years of our Heritage. Save it Now." is one
          sentence, and splitting it across two h1s would read as two to
          anything that cannot see the layout.
        */}
        <h1 className="mt-10 sm:mt-14">
          <span
            className="animate-rise flex flex-wrap items-end gap-x-4 gap-y-1"
            style={{ '--reveal-delay': '90ms' } as React.CSSProperties}
          >
            <span
              className="font-display font-bold leading-[0.82] tracking-[-0.03em] text-[var(--color-brand-saffron)]"
              style={{ fontSize: 'clamp(3.75rem, 13vw, 7.5rem)' }}
            >
              2,000
            </span>
            <span
              className="font-display font-semibold leading-[1.02] tracking-tight text-[var(--color-brand-saffron)]"
              style={{ fontSize: 'clamp(1.35rem, 3.6vw, 2.15rem)' }}
            >
              Years
              <br />
              of our
              <br />
              Heritage
            </span>
          </span>

          <span
            className="animate-rise mt-1 block font-display font-bold leading-[0.9] tracking-[-0.025em] text-[var(--color-brand-blue)] sm:mt-2"
            style={
              {
                fontSize: 'clamp(3rem, 10.5vw, 6rem)',
                '--reveal-delay': '180ms',
              } as React.CSSProperties
            }
          >
            Save it Now
          </span>
        </h1>

        <p
          className="animate-rise mt-7 max-w-xl leading-relaxed text-ink-2 sm:text-lg"
          style={{ '--reveal-delay': '260ms' } as React.CSSProperties}
        >
          The Bene Israel, Cochin, Baghdadi and Bnei Menashe communities of India, kept together in
          one place. Everything here was checked by a person before it was published.
        </p>

        {/* The two doors. Filled is the one the Center wants taken. */}
        <div
          className="animate-rise mt-9 flex flex-col gap-3.5 sm:flex-row sm:items-center"
          style={{ '--reveal-delay': '340ms' } as React.CSSProperties}
        >
          <Link
            href="/portal"
            className="group inline-flex h-14 items-center justify-center gap-2.5 rounded-full bg-[var(--color-brand-blue)] px-8 text-lg font-medium text-paper shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--color-brand-blue-deep)] hover:shadow-lift"
          >
            Explore the archive
            <ArrowRight
              size={19}
              aria-hidden
              className="transition-transform duration-200 group-hover:translate-x-1"
            />
          </Link>

          <Link
            href="/upload"
            className="inline-flex h-14 items-center justify-center gap-2.5 rounded-full border-2 border-[var(--color-brand-saffron)] bg-paper px-8 text-lg font-medium text-ink transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--color-brand-saffron)]/12 hover:shadow-soft"
          >
            <Upload size={19} aria-hidden />
            Add something you kept
          </Link>
        </div>

        {total > 0 && counts && (
          <p
            className="animate-rise mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted"
            style={{ '--reveal-delay': '420ms' } as React.CSSProperties}
          >
            <span className="machine">
              {total} {total === 1 ? 'record' : 'records'} published
            </span>
            {COMMUNITY_ORDER.filter((community) => counts[community] > 0).map((community) => (
              <span key={community} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: `var(--color-${communityToken(community)})` }}
                />
                {COMMUNITY_LABELS[community]} · {counts[community]}
              </span>
            ))}
          </p>
        )}
      </div>

      {/* The poster's blue foot. It is the one place the campaign colour is
          allowed to take a whole band, and it closes the page the way the
          artwork closes. */}
      <div aria-hidden className="h-14 w-full bg-[var(--color-brand-blue)] sm:h-16" />
    </div>
  );
}

/** The stream colours are named for the community, not by it. */
function communityToken(community: string): string {
  return (
    {
      bene_israel: 'bene',
      cochin: 'cochin',
      baghdadi: 'baghdadi',
      bnei_menashe: 'menashe',
      general_india: 'general',
    }[community] ?? 'general'
  );
}
