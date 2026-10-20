import Link from 'next/link';
import { FolderPlus } from 'lucide-react';
import { FACETS, validDay, pagination } from '@/lib/items/portal-facets';
import { buttonClass } from '@/components/primitives';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ItemCard, ItemRow } from '@/components/item-card';
import { PortalFilters } from '@/components/portal-filters';
import { EmptyState } from '@/components/primitives';
import { Reveal } from '@/components/reveal';
import { countPublishedItems, getPortalFacetOptions, listPublishedItems } from '@/lib/items/queries';
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

  const filters = {
    ...Object.fromEntries(FACETS.filter(key => key !== 'category' && key !== 'community').map(key => [key, one(params[key])])),
    query, category, community, from: validDay(one(params.from)), to: validDay(one(params.to)),
  };
  const perPage = 48;
  const [contributions, archiveTotal, { t }] = await Promise.all([
    contributor ? listItemsByContributor(contributor, filters) : Promise.resolve(null),
    countPublishedItems(filters), getMessages(),
  ]);
  const options = await getPortalFacetOptions(filters, contributions?.map(item => item.id));
  const total = contributions?.length ?? archiveTotal;
  const { page, pages, offset } = pagination(total, one(params.page), perPage);
  const found = contributions ? contributions.slice(offset, offset + perPage) : await listPublishedItems({ ...filters, offset, limit: perPage });
  const { items } = await presentMany(found);
  function pageHref(n: number) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) { const v = one(value); if (v) next.set(key, v); }
    next.set('page', String(n));
    return '/portal?' + next.toString();
  }

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
      <Link href="/upload" className={buttonClass('primary', 'mb-4')}><FolderPlus size={19} aria-hidden />{t('nav.contribute')}</Link>
      <header className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-display text-[1.75rem] leading-none sm:text-[2.25rem]">
          {t('portal.headline1')} <span className="text-accent-strong">{t('portal.headline2')}</span>
        </h1>
        <p className="text-sm text-muted">{t('portal.eyebrow')}</p>
      </header>

      <Suspense fallback={<div className="h-28" />}>
        <PortalFilters
          view={view}
          options={options}
          shown={items.length}
          total={total}
        />
      </Suspense>

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
          Four across on a laptop, and dense.

          Three columns of 4:3 cards with five lines of caption made a page you
          read. Four columns of square plates makes a wall you look at, which is
          what the holdings are. The gap is tight for the same reason: a wall,
          not a slideshow.

          The page fills the browser (21.09), so a wider screen gets more
          columns rather than bigger cards: a tile is a 640px thumbnail, and at
          four across a 2560px screen each stood 612px and went soft (Eden,
          16.10). Up to seven across keeps every card near 350px.
        */
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 4xl:grid-cols-7">
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
      {pages > 1 && <nav aria-label={t('filters.page', { page, pages })} className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {page > 1 && <Link href={pageHref(page - 1)} className={buttonClass('quiet', 'min-h-11')}>{t('filters.previous')}</Link>}
        <span>{t('filters.page', { page, pages })}</span>
        {page < pages && <Link href={pageHref(page + 1)} className={buttonClass('quiet', 'min-h-11')}>{t('filters.next')}</Link>}
      </nav>}
    </div>
  );
}
