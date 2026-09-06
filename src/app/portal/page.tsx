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
import { getMessages } from '@/lib/i18n';
import { presentMany } from '@/lib/translate/render';
import { listItemsByContributor } from '@/lib/items/queries';
import { getCurrentVolunteer } from '@/lib/supabase/server';
import { ContributorSearch } from '@/components/contributor-search';

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

  /*
   * Open to anyone, and bounded by what is already public.
   *
   * A visitor searching an address gets back only records that are already
   * published — the same rows they could reach by scrolling. A volunteer gets
   * the rest as well. `listItemsByContributor` draws that line, not this page:
   * a hidden control is not a permission.
   */
  const volunteer = Boolean(await getCurrentVolunteer());
  const sent = contributor ? await listItemsByContributor(contributor) : null;

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
  const [found, counts, total, { t }] = await Promise.all([
    listPublishedItems({ query, category, community }),
    getCommunityCounts().catch(emptyCommunityCounts),
    countPublishedItems({ query, category, community }),
    getMessages(),
  ]);

  // The cards carry the reader's language too. One query for the whole page —
  // see `presentMany`, and why it does not ask for what is missing.
  const { items } = await presentMany(found);

  const filtered = Boolean(query || category || community);
  const truncated = items.length < total;

  return (
    <div className="mx-auto max-w-6xl px-6 pt-8 pb-14 sm:pt-12 sm:pb-16">
      {/* The thesis, and the shape of the archive under it. */}
      <header className="mb-8 max-w-3xl sm:mb-10">
        <p className="eyebrow animate-rise">{t('portal.eyebrow')}</p>
        <h1
          className="animate-rise mt-3 font-display text-[2.5rem] leading-[1.06] tracking-tight sm:text-5xl md:text-6xl"
          style={{ '--reveal-delay': '80ms' } as React.CSSProperties}
        >
          {t('portal.headline1')}
          <br />
          <span className="text-accent-strong">{t('portal.headline2')}</span>
        </h1>
        <p
          className="animate-rise mt-5 leading-relaxed text-muted sm:text-lg"
          style={{ '--reveal-delay': '160ms' } as React.CSSProperties}
        >
          {t('portal.standfirst')}
        </p>
      </header>

      <div className="mb-8">
        <ContributorSearch current={contributor ?? ''} volunteer={volunteer} />
      </div>

      {sent !== null ? (
        <section>
          <p className="eyebrow mb-1">{t('contributor.found', { email: contributor ?? '' })}</p>
          <p className="mb-6 text-sm text-muted">
            {sent.length === 0 ? t('contributor.none') : null}
          </p>
          {sent.length > 0 && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {sent.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
      ) : (
      <>
      <div className="mb-12">
        <StreamSummary counts={counts} active={community} />
      </div>

      <Reveal as="section" className="mb-8">
        <Suspense fallback={<div className="h-28" />}>
          <PortalControls view={view} />
        </Suspense>
      </Reveal>

      <p className="eyebrow mb-5" aria-live="polite">
        {t(
          filtered
            ? total === 1
              ? 'portal.countMatchingOne'
              : 'portal.countMatching'
            : total === 1
              ? 'portal.countPublishedOne'
              : 'portal.countPublished',
          { count: total },
        )}
      </p>

      {/* A ceiling the platform imposes, not the archive. If it is ever
          reached the visitor is told, because a list that quietly stops is
          worse than a list that admits where it stopped. */}
      {truncated && (
        <p className="machine mb-5 text-sm text-caution">
          {t('portal.truncated', { count: items.length })}
        </p>
      )}

      {items.length === 0 ? (
        <Reveal>
          <EmptyState
            title={t('portal.emptyTitle')}
            body={t('portal.emptyBody')}
            action={{ href: '/upload', label: t('footer.contribute') }}
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
      </>
      )}
    </div>
  );
}
