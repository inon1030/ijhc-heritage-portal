'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FilePreview } from './file-preview';
import { ReviewBulkTable } from './review-bulk-table';
import { useMessages } from '@/lib/i18n/provider';
import { categoryKey, communityKey } from '@/lib/i18n/labels';
import { readingState, waitingDays } from '@/lib/items/review-order';
import type { AiAnalysis, Item, ItemFile } from '@/lib/types';

type QueueItem = Item & { file: ItemFile | null; analysis: AiAnalysis | null };
const button = 'min-h-11 rounded-full border border-rule-strong bg-paper px-5 focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-50';
export function ReviewQueue({ items }: { items: QueueItem[] }) {
  const t = useMessages();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<string[]>([]);
  const [batch, setBatch] = useState<string[] | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  useEffect(() => {
    // Storage can be unavailable in private browsers; the default remains usable.
    try { if (localStorage.getItem('ijhc.review.view') === 'list') queueMicrotask(() => setView('list')); } catch {}
  }, []);
  function changeView(next: 'grid' | 'list') { setView(next); try { localStorage.setItem('ijhc.review.view', next); } catch {} }
  const remaining = items.filter(item => !done.includes(item.id));
  const pageCount = Math.max(1, Math.ceil(remaining.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = remaining.slice(currentPage * 50, (currentPage + 1) * 50);
  const allSelected = visible.length > 0 && visible.every(item => selected.includes(item.id));
  return <section className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label={t('review3.view')} className="flex gap-2">
        <button type="button" className={button} aria-pressed={view === 'grid'} onClick={() => changeView('grid')}>{t('review3.grid')}</button>
        <button type="button" className={button} aria-pressed={view === 'list'} onClick={() => changeView('list')}>{t('review3.list')}</button>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3"><input className="h-5 w-5 accent-[var(--color-accent-strong)]" type="checkbox" checked={allSelected} disabled={!visible.length || Boolean(batch)} onChange={() => setSelected(allSelected ? [] : visible.map(item => item.id))} />{t('review3.selectPage')}</label>
      <button type="button" className={button} disabled={!selected.length || Boolean(batch)} onClick={() => setBatch([...selected])}>{t('review3.approveSelected', { count: selected.length })}</button>
    </div>
    {batch && <ReviewBulkTable ids={batch} close={() => setBatch(null)} completed={ids => { setDone(previous => [...new Set([...previous, ...ids])]); setSelected(previous => previous.filter(id => !ids.includes(id))); }} />}
    <ul className={view === 'grid' ? 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3'}>{visible.map(item => <li key={item.id} className={`card min-w-0 overflow-hidden ${view === 'list' ? 'grid gap-3 p-4 sm:grid-cols-[7rem_1fr_auto]' : ''}`}>
      <div className={view === 'list' ? 'aspect-[4/3] w-28 overflow-hidden rounded-lg bg-paper-2' : 'aspect-[4/3] overflow-hidden bg-paper-2'}><FilePreview file={item.file} alt={item.title} still /></div>
      <div className={view === 'grid' ? 'space-y-2 p-4' : 'min-w-0 space-y-2'}>
        <Link href={`/review/${item.id}`} className="inline-flex min-h-11 items-center break-words font-display text-xl underline-offset-4 hover:underline focus-visible:outline-2">{item.title}</Link>
        <p className="text-sm text-muted">{item.community ? t(communityKey(item.community)) : t('review3.unassigned')} · {t(categoryKey(item.category))}</p>
        <p className="text-sm">{t(readingState(item) === 'ready' ? 'queue.ready' : readingState(item) === 'failed' ? 'queue.failed' : readingState(item) === 'pending' ? 'queue.pending' : 'queue.missing')} · {t('queue.waitingDays', { count: waitingDays(item.created_at) })}</p>
        <p className="break-words text-sm text-muted" dir="auto">{[...new Set([...item.contributor_keywords, ...(item.analysis?.keywords ?? [])])].join(', ')}</p>
      </div>
      <label className={`flex min-h-11 cursor-pointer items-center gap-3 ${view === 'grid' ? 'px-4 pb-4' : 'self-start'}`}><input type="checkbox" className="h-5 w-5 accent-[var(--color-accent-strong)]" checked={selected.includes(item.id)} disabled={Boolean(batch) || (!selected.includes(item.id) && selected.length >= 50)} onChange={e => setSelected(previous => e.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} />{t('review3.select')}</label>
    </li>)}</ul>
    {pageCount > 1 && <nav aria-label={t('review3.pages')} className="flex flex-wrap items-center gap-3">
      <button type="button" className={button} disabled={currentPage === 0 || Boolean(batch)} onClick={() => { setPage(currentPage - 1); setSelected([]); }}>{t('review3.previous')}</button>
      <span>{t('review3.page', { page: currentPage + 1, count: pageCount })}</span>
      <button type="button" className={button} disabled={currentPage + 1 >= pageCount || Boolean(batch)} onClick={() => { setPage(currentPage + 1); setSelected([]); }}>{t('review3.next')}</button>
    </nav>}
  </section>;
}
