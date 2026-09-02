import Link from 'next/link';
import type { Metadata } from 'next';
import { FilePreview } from '@/components/file-preview';
import { EmptyState, StatusPill } from '@/components/primitives';
import { Reveal } from '@/components/reveal';
import { AwaitingApproval } from '@/components/awaiting-approval';
import { listReviewQueue } from '@/lib/items/queries';
import { getCurrentProfile, getCurrentVolunteer } from '@/lib/supabase/server';
import { categoryLabel, type AiAnalysis, type Item, type ItemFile } from '@/lib/types';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Review queue',
};

// The queue changes as reviewers work through it, so never serve it from cache.
export const dynamic = 'force-dynamic';

/**
 * Reachable only with a volunteer session: middleware redirects, and RLS
 * returns an empty set even if that were bypassed.
 */
export default async function ReviewPage() {
  // RLS would return an empty set for a pending account, and an empty queue
  // renders as "everything is reviewed" — true of the rows it can see, and
  // completely the wrong thing to tell them.
  const volunteer = await getCurrentVolunteer();
  if (!volunteer) {
    const profile = await getCurrentProfile();
    if (profile) return <AwaitingApproval email={profile.email} />;
  }

  const items = await listReviewQueue();

  /*
   * Two groups, not one list.
   *
   * Most of what arrives is the archive's material. Some is a holiday
   * photograph or a screenshot, and a volunteer working down a single list
   * reads each of those as carefully as a ketubah before discovering it is not
   * one. Separating them costs the model one boolean and saves the reading.
   *
   * It is a suggestion and nothing more: both groups are the same queue, both
   * open the same workbench, and nothing is rejected without a person. The
   * grouping is the only thing the flag does.
   */
  const archive = items.filter((item) => !item.analysis?.off_topic);
  const unrelated = items.filter((item) => item.analysis?.off_topic);

  return (
    <div className="mx-auto max-w-6xl px-6 pt-8 pb-14 sm:pt-12 sm:pb-16">
      <header className="mb-9 max-w-2xl">
        <p className="eyebrow animate-rise">Volunteers only</p>
        <h1 className="animate-rise mt-3 font-display text-3xl leading-tight sm:text-5xl">Review queue</h1>
        <p
          className="animate-rise mt-4 leading-relaxed text-muted sm:text-lg"
          style={{ '--reveal-delay': '90ms' } as React.CSSProperties}
        >
          Machine suggestions are a starting point, not a record. Check each item against the
          original before it is published.
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title="The queue is clear"
          body="Every submission has been reviewed. New contributions appear here as soon as they arrive."
          action={{ href: '/portal', label: 'Open the portal' }}
        />
      ) : (
        <>
          {archive.length > 0 && (
            <section className="mb-12">
              <p className="eyebrow mb-4">
                {archive.length} awaiting {archive.length === 1 ? 'a decision' : 'decisions'}
              </p>
              <QueueGrid items={archive} />
            </section>
          )}

          {unrelated.length > 0 && (
            <section>
              <div className="mb-4 border-t border-rule pt-6">
                <p className="eyebrow">
                  {unrelated.length} that may not belong here
                </p>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
                  The archive read these as something other than Indian Jewish heritage. That is a
                  suggestion and it is often wrong about a faded or cropped item, so they are set
                  aside rather than refused — open one and reject it, or catalogue it like any
                  other.
                </p>
              </div>
              <QueueGrid items={unrelated} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

type QueueItem = Item & { file: ItemFile | null; analysis: AiAnalysis | null };

function QueueGrid({ items }: { items: QueueItem[] }) {
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
                <FilePreview file={item.file} alt={item.title} />
              </div>
            </div>
            <div className="space-y-2.5 p-5">
              <div className="flex items-center justify-between gap-2">
                <StatusPill status={item.status} />
                <span className="eyebrow">{categoryLabel(item.category)}</span>
              </div>
              <h2 className="font-display text-xl leading-snug transition-colors group-hover:text-accent">
                {item.title}
              </h2>
              {item.analysis?.summary && (
                <p className="machine line-clamp-2 text-muted">{item.analysis.summary}</p>
              )}
              {/* The clause, not the verdict. "a festival in Cusco, Peru" is
                  something a volunteer can agree or disagree with at a glance. */}
              {item.analysis?.off_topic && item.analysis.off_topic_reason && (
                <p className="machine text-caution">{item.analysis.off_topic_reason}</p>
              )}
              <p className="machine text-muted">
                {formatDate(item.created_at)}
                {item.analysis?.provider === 'mock' && ' · simulated analysis'}
              </p>
            </div>
          </Link>
        </Reveal>
      ))}
    </ul>
  );
}
