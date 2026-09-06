import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ItemCard, ItemRow } from '@/components/item-card';
import { PortalFilters } from '@/components/portal-filters';
import { EmptyState } from '@/components/primitives';
import { Reveal } from '@/components/reveal';
import { countPublishedItems, getCommunityCounts, listPublishedItems } from '@/lib/items/queries';
import { emptyCommunityCounts } from '@/lib/communities';
import { CATEGORIES, COMMUNITIES, type Community, type ItemCategory } from '@/lib/types';
import { getMessages } from '@/lib/i18n';
import { presentMany } from '@/lib/translate/render';
import { listItemsByContributor } from '@/lib/items/queries';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getMessages();
  return { title: t('portal.title'), description: t('portal.description') };
}

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
  const contributor = one(params.contributor)?.trim();

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
  const [base, counts, archiveTotal, { t }] = await Promise.all([
    /*
     * The contributor address is a filter like any other on this page, and the
     * only one that cannot be a `where` clause on `items`: it resolves through
     * `contributors`, which is volunteer-only, and it is the one filter whose
     * scope changes with who is asking. `listItemsByContributor` draws that
     * line — a visitor gets the person's published records, a volunteer gets
     * what is still in review as well.
     */
    contributor
      ? listItemsByContributor(contributor)
      : listPublishedItems({ query, category, community }),
    getCommunityCounts().catch(emptyCommunityCounts),
    countPublishedItems(),
    getMessages(),
  ]);

  /*
   * The remaining filters, applied here when a contributor is in play.
   *
   * One person's contributions are a handful of rows, so narrowing them in
   * memory costs nothing and keeps the security decision in one place: the
   * database query that decides *whose* records these are is the one that
   * knows about volunteers, and stacking three more predicates onto it would
   * spread that decision across four call sites.
   */
  const found = contributor
    ? base.filter(
        (item) =>
          (!category || item.category === category) &&
          (!community || item.community === community) &&
          (!query ||
            `${item.title} ${item.description ?? ''} ${item.origin_place ?? ''}`
              .toLowerCase()
              .includes(query.toLowerCase())),
      )
    : base;

  // The cards carry the reader's language too. One query for the whole page —
  // see `presentMany`, and why it does not ask for what is missing.
  const { items } = await presentMany(found);

  const truncated = !contributor && items.length < archiveTotal && !query && !category && !community;

  return (
    <div className="mx-auto max-w-7xl px-6 pt-5 pb-14 sm:pt-7 sm:pb-16">
      {/*
        ── the chrome, in one bar ────────────────────────────────────────────

        Measured on the deployed portal at 1440x900 before this: the first
        photograph began at 1067px and none of the eight were above the fold,
        behind roughly 950px of header, stream panel, contributor box and
        filter card. The archive's whole argument is the photographs, and a
        visitor had to scroll past four boxes explaining the archive to reach
        one.

        The title is now a line rather than a block, the four stream cards are
        the stream filters, and the filters are one row. What was four stacked
        panels is a single bar, so the grid begins near the top of the screen
        and the page opens on pictures.
      */}
      <header className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-display text-2xl leading-none sm:text-[1.75rem]">
          {t('portal.headline1')} <span className="text-accent-strong">{t('portal.headline2')}</span>
        </h1>
        <p className="text-sm text-muted">{t('portal.eyebrow')}</p>
      </header>

      <Suspense fallback={<div className="h-28" />}>
        <PortalFilters
          view={view}
          counts={{ communities: counts, categories: {} }}
          shown={items.length}
          total={archiveTotal}
        />
      </Suspense>

      {/* A ceiling the platform imposes, not the archive. */}
      {truncated && (
        <p className="machine mt-4 text-sm text-caution">
          {t('portal.truncated', { count: items.length })}
        </p>
      )}

      {items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={t('portal.emptyTitle')}
            body={t('portal.emptyBody')}
            action={{ href: '/upload', label: t('footer.contribute') }}
          />
        </div>
      ) : view === 'grid' ? (
        /*
          Four across at the widest, and dense.

          Three columns of 4:3 cards with five lines of caption made a page you
          read. Four columns of square plates makes a wall you look at, which is
          what the holdings are. The gap is tight for the same reason: a wall,
          not a slideshow.
        */
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {items.map((item, index) => (
            <Reveal key={item.id} delay={Math.min(index, 11) * 45}>
              <ItemCard item={item} />
            </Reveal>
          ))}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {items.map((item, index) => (
            <Reveal key={item.id} delay={Math.min(index, 8) * 45} from="left">
              <ItemRow item={item} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
