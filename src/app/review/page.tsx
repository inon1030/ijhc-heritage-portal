import Link from 'next/link';
import type { Metadata } from 'next';
import { FilePreview } from '@/components/file-preview';
import { EmptyState, StatusPill } from '@/components/primitives';
import { Reveal } from '@/components/reveal';
import { AwaitingApproval } from '@/components/awaiting-approval';
import { readingState, waitingDays } from '@/lib/items/review-order';
import { listReviewQueue, listUncataloguedPublished } from '@/lib/items/queries';
import { getCurrentProfile, getCurrentVolunteer } from '@/lib/supabase/server';
import { type AiAnalysis, type Item, type ItemFile } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { getMessages } from '@/lib/i18n';
import { categoryKey } from '@/lib/i18n/labels';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getMessages();
  return { title: t('queue.title') };
}

// The queue changes as reviewers work through it, so never serve it from cache.
export const dynamic = 'force-dynamic';

/**
 * Reachable only with a volunteer session: middleware redirects, and RLS
 * returns an empty set even if that were bypassed.
 */
export default async function ReviewPage() {
  const { t } = await getMessages();
  // RLS would return an empty set for a pending account, and an empty queue
  // renders as "everything is reviewed" — true of the rows it can see, and
  // completely the wrong thing to tell them.
  const volunteer = await getCurrentVolunteer();
  if (!volunteer) {
    const profile = await getCurrentProfile();
    if (profile) return <AwaitingApproval email={profile.email} />;
  }

  const [items, uncatalogued] = await Promise.all([listReviewQueue(), volunteer ? listUncataloguedPublished() : []]);

  const archive = items.filter((item) => readingState(item) === 'ready');
  const unread = items.filter((item) => readingState(item) !== 'ready');

  return (
    <div className="mx-auto max-w-6xl px-6 pt-8 pb-14 sm:pt-12 sm:pb-16">
      <header className="mb-9 max-w-2xl">
        <p className="eyebrow animate-rise">{t('queue.volunteersOnly')}</p>
        <h1 className="animate-rise mt-3 font-display text-3xl leading-tight sm:text-5xl">
          {t('queue.title')}
        </h1>
        <p
          className="animate-rise mt-4 leading-relaxed text-muted sm:text-lg"
          style={{ '--reveal-delay': '90ms' } as React.CSSProperties}
        >
          {t('queue.intro')}
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title={t('queue.clear')}
          body={t('queue.emptyBody')}
          action={{ href: '/portal', label: t('queue.openPortal') }}
        />
      ) : (
        <>
          {archive.length > 0 && (
            <section className="mb-12">
              <p className="eyebrow mb-4">
                {t('queue.ready')} · {archive.length}
              </p>
              <QueueGrid items={archive} />
            </section>
          )}

          {unread.length > 0 && <section className="mb-12">
            <h2 className="eyebrow mb-4">{t('queue.unread')} · {unread.length}</h2>
            <QueueGrid items={unread} />
          </section>}
        </>
      )}
      {uncatalogued.length > 0 && <section className="mt-10 border-t border-rule pt-6">
        <h2 className="mb-4 font-display text-2xl">{t('queue.uncatalogued')}</h2>
        <QueueGrid items={uncatalogued} />
      </section>}
    </div>
  );
}

type QueueItem = Item & { file: ItemFile | null; analysis: AiAnalysis | null };

async function QueueGrid({ items }: { items: QueueItem[] }) {
  const { t } = await getMessages();
  return (
    <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => (
        <Reveal as="li" key={item.id} delay={Math.min(index, 8) * 60}>
          <Link
            href={`/review/${item.id}`}
            className="card card-interactive group block h-full overflow-hidden focus-visible:outline-offset-4"
          >
            <div className="aspect-[4/3] overflow-hidden bg-paper-2">
              <div className="h-full w-full transition-transform duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]">
                <FilePreview file={item.file} alt={item.title} still />
              </div>
            </div>
            <div className="space-y-2.5 p-5">
              <div className="flex items-center justify-between gap-2">
                <StatusPill status={item.status} />
                <span className="eyebrow">{t(categoryKey(item.category))}</span>
              </div>
              <h2 className="font-display text-xl leading-snug transition-colors group-hover:text-accent">
                {item.title}
              </h2>
              {readingState(item) !== 'ready' && <p className="text-caution">
                {t(readingState(item) === 'failed' ? 'queue.failed' : readingState(item) === 'pending' ? 'queue.pending' : 'queue.missing')}
              </p>}
              {item.analysis?.summary && (
                <p className="machine line-clamp-2 text-muted">{item.analysis.summary}</p>
              )}
              {/* The clause, not the verdict. "a festival in Cusco, Peru" is
                  something a knowledge expert can agree or disagree with at a glance. */}
              {item.analysis?.off_topic && item.analysis.off_topic_reason && (
                <p className="machine text-caution">{item.analysis.off_topic_reason}</p>
              )}
              <p className="machine text-muted">
                {formatDate(item.created_at)} · {t('queue.waitingDays', { count: waitingDays(item.created_at) })}
                {item.analysis?.provider === 'mock' && ` · ${t('queue.simulated')}`}
              </p>
            </div>
          </Link>
        </Reveal>
      ))}
    </ul>
  );
}
