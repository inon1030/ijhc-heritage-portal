'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useMessages } from '@/lib/i18n/provider';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/primitives';
import { FilePreview } from '@/components/file-preview';
import { COMMUNITY_LABELS, type Item, type ItemFile } from '@/lib/types';
import { formatDate } from '@/lib/utils';

type BinnedItem = Item & { file: ItemFile | null };

/**
 * The bin.
 *
 * Restoring is one click because it is the safe direction — the record goes
 * back exactly as it was, with the review decision it already carried.
 * Destroying asks for the record's title to be typed, which is the only gate on
 * this screen that is deliberately annoying: it is the single action in the
 * whole archive that cannot be undone by anybody, and a confirm dialog is
 * something people click through without reading.
 */
export function BinManager({ items }: { items: BinnedItem[] }) {
  const t = useMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [purging, setPurging] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  async function send(id: string, method: 'POST' | 'DELETE') {
    setError(null);
    setBusyId(id);

    const response = await fetch(`/api/manage/bin/${id}`, { method });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? 'That did not go through. Try again.');
      setBusyId(null);
      return;
    }

    setBusyId(null);
    setPurging(null);
    setTyped('');
    startTransition(() => router.refresh());
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title={t('bin.empty')}
        body="Records a knowledge expert removes land here rather than disappearing. Nothing has been removed yet."
        action={{ href: '/review', label: 'Go to the review queue' }}
      />
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {error && (
        <p
          role="alert"
          className="rounded-lg border-s-[3px] border-critical bg-critical/8 px-3 py-2 text-sm text-critical"
        >
          {error}
        </p>
      )}

      <p className="max-w-2xl leading-relaxed text-muted">
        {items.length === 1 ? 'One record is' : `${items.length} records are`} in the bin. They are
        off the portal and out of the review queue, and they are still here in full — restoring one
        puts back the decision it already carried.
      </p>

      <ul className="space-y-3">
        {items.map((item) => {
          const busy = busyId === item.id;
          const confirmingThis = purging === item.id;

          return (
            <li key={item.id} className="card rounded-xl p-4">
              <div className="flex gap-4">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-paper-2">
                  {item.file && <FilePreview file={item.file} alt="" fit="cover" />}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg">{item.title}</p>
                  <p className="machine mt-1 text-sm text-muted">
                    {item.community ? COMMUNITY_LABELS[item.community] : 'No stream'} · was{' '}
                    {item.status} · binned {item.deleted_at ? formatDate(item.deleted_at) : ''}
                  </p>
                  {item.deleted_reason && (
                    <p className="mt-1.5 text-sm leading-relaxed">“{item.deleted_reason}”</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    type="button"
                    disabled={busy || pending}
                    onClick={() => send(item.id, 'POST')}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-rule-strong bg-paper px-4 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-strong hover:bg-accent-wash disabled:pointer-events-none disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 size={15} className="animate-spin" aria-hidden />
                    ) : (
                      <RotateCcw size={15} aria-hidden />
                    )}
                    Restore
                  </button>

                  <button
                    type="button"
                    disabled={busy || pending}
                    onClick={() => {
                      setPurging(confirmingThis ? null : item.id);
                      setTyped('');
                    }}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-critical px-4 text-sm font-medium text-critical transition-all duration-200 hover:-translate-y-0.5 hover:bg-critical/8 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Trash2 size={15} aria-hidden />
                    {t('bin.destroy')}
                  </button>
                </div>
              </div>

              {confirmingThis && (
                <div className="mt-4 rounded-lg border-s-[3px] border-critical bg-critical/6 px-4 py-3.5">
                  <p className="text-sm leading-relaxed">
                    This destroys the record, its catalogue, and the uploaded file itself. Nothing
                    brings it back. Type <strong>{item.title}</strong> to confirm.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      value={typed}
                      onChange={(event) => setTyped(event.target.value)}
                      aria-label={`Type the title to destroy ${item.title}`}
                      className="h-11 flex-1 rounded-lg border border-rule-strong bg-paper px-3"
                    />
                    <button
                      type="button"
                      disabled={typed.trim() !== item.title.trim() || busy}
                      onClick={() => send(item.id, 'DELETE')}
                      className="inline-flex h-11 items-center gap-2 rounded-full bg-critical px-5 text-sm font-medium text-paper transition-all duration-200 hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-40"
                    >
                      {busy && <Loader2 size={15} className="animate-spin" aria-hidden />}
                      Destroy for good
                    </button>
                    <button
                      type="button"
                      onClick={() => setPurging(null)}
                      className="h-11 rounded-full px-4 text-sm text-muted hover:text-ink"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
