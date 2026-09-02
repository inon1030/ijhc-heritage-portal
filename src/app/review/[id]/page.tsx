import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { ReviewWorkbench } from '@/components/review-workbench';
import { getItemDetail, listItemEvents } from '@/lib/items/queries';
import { listFamilies, listItemFamilyIds } from '@/lib/vocabulary/queries';
import { readVocabulary } from '@/lib/vocabulary/load';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Review' };
export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function ReviewItemPage({ params }: { params: Params }) {
  const { id } = await params;
  const item = await getItemDetail(id);
  if (!item) notFound();

  const [events, vocabulary, families, selectedFamilyIds] = await Promise.all([
    listItemEvents(id),
    readVocabulary(),
    listFamilies(),
    listItemFamilyIds(id),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <Link href="/review" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} /> Back to the queue
      </Link>

      <ReviewWorkbench
        item={item}
        vocabulary={vocabulary}
        families={families}
        selectedFamilyIds={selectedFamilyIds}
      />

      {events.length > 0 && (
        <section className="mt-12 border-t border-rule pt-6">
          <h2 className="eyebrow mb-3">History</h2>
          <ol className="space-y-1.5">
            {events.map((event) => (
              <li key={event.id} className="machine text-muted">
                {formatDate(event.created_at)} · {event.action}
                {event.from_status && event.to_status
                  ? ` · ${event.from_status} to ${event.to_status}`
                  : event.to_status
                    ? ` · ${event.to_status}`
                    : ''}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
