import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ItemCard, ItemRow } from '@/components/item-card';
import { PortalControls } from '@/components/portal-controls';
import { EmptyState } from '@/components/primitives';
import { Reveal } from '@/components/reveal';
import { StreamSummary } from '@/components/stream-summary';
import { countPublishedItems, getCommunityCounts, listPublishedItems } from '@/lib/items/queries';
import { emptyCommunityCounts } from '@/lib/communities';
import { CATEGORIES, COMMUNITIES, type Community, type ItemCategory } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Heritage Portal',
  description:
    'Search verified records from the Bene Israel, Cochin, Baghdadi and Bnei Menashe communities.',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PortalPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const query = one(params.q);
  const categoryParam = one(params.category);
  const communityParam = one(params.community);
  const view = one(params.view) === 'list' ? 'list' : 'grid';

  const category = CATEGORIES.includes(categoryParam as ItemCategory)
    ? (categoryParam as ItemCategory)
    : undefined;
  const community = COMMUNITIES.includes(communityParam as Community)
    ? (communityParam as Community)
    : undefined;

  /*
   * The list, and — separately — how many there actually are.
   *
   * Deliberately not `items.length`. The portal asks for every matching record
   * with no limit of its own, but PostgREST caps a response at a thousand rows
   * and says nothing when it does: measured on this project, a 2500-row table
   * came back as exactly a thousand with `error: null`. Printing the length of
   * the list would one day tell a visitor the archive holds a thousand records
   * when it holds four thousand, and nothing would look wrong.
   *
   * So the number on the page is counted in the database, and if the list is
   * shorter than the count the page says so rather than quietly showing less.
   */
  const [items, counts, total] = await Promise.all([
    listPublishedItems({ query, category, community }),
    getCommunityCounts().catch(emptyCommunityCounts),
    countPublishedItems({ query, category, community }),
  ]);

  const filtered = Boolean(query || category || community);
  const truncated = items.length < total;

  return (
    <div className="mx-auto max-w-6xl px-6 pt-8 pb-14 sm:pt-12 sm:pb-16">
      {/* The thesis, and the shape of the archive under it. */}
      <header className="mb-8 max-w-3xl sm:mb-10">
        <p className="eyebrow animate-rise">A digital archive of Indian Jewish life</p>
        <h1
          className="animate-rise mt-3 font-display text-[2.5rem] leading-[1.06] tracking-tight sm:text-5xl md:text-6xl"
          style={{ '--reveal-delay': '80ms' } as React.CSSProperties}
        >
          Four streams,
          <br />
          <span className="text-accent-strong">one river</span>
        </h1>
        <p
          className="animate-rise mt-5 leading-relaxed text-muted sm:text-lg"
          style={{ '--reveal-delay': '160ms' } as React.CSSProperties}
        >
          Records from the Bene Israel, Cochin, Baghdadi and Bnei Menashe communities. Every
          description here was read and checked by a person before it was published.
        </p>
      </header>

      <div className="mb-12">
        <StreamSummary counts={counts} active={community} />
      </div>

      <Reveal as="section" className="mb-8">
        <Suspense fallback={<div className="h-28" />}>
          <PortalControls view={view} />
        </Suspense>
      </Reveal>

      <p className="eyebrow mb-5" aria-live="polite">
        {total} {total === 1 ? 'record' : 'records'}
        {filtered ? ' matching' : ' published'}
      </p>

      {/* A ceiling the platform imposes, not the archive. If it is ever
          reached the visitor is told, because a list that quietly stops is
          worse than a list that admits where it stopped. */}
      {truncated && (
        <p className="machine mb-5 text-sm text-caution">
          Showing the first {items.length}. Narrow the search to see the rest.
        </p>
      )}

      {items.length === 0 ? (
        <Reveal>
          <EmptyState
            title="Nothing matches that yet"
            body="Try a broader search, or clear the filters. If the archive is new, the first records appear here once a volunteer has reviewed them."
            action={{ href: '/upload', label: 'Contribute an item' }}
          />
        </Reveal>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            // The stagger is capped: considered on nine cards, broken on ninety.
            <Reveal key={item.id} delay={Math.min(index, 8) * 60}>
              <ItemCard item={item} />
            </Reveal>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item, index) => (
            <Reveal key={item.id} delay={Math.min(index, 8) * 50} from="left">
              <ItemRow item={item} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
