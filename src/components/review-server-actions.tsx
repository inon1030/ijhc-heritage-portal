'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMessages } from '@/lib/i18n/provider';

type Pair = { id: string; reason: string; item: { id: string; title: string; thumbnail: string | null } };
type Retry = { id: string; count: number; eligible: boolean; running: boolean };
const button = 'inline-flex min-h-11 items-center justify-center rounded-full border border-rule px-5 py-2 text-center font-medium hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50';

/** Mounted only in the server-gated expert workbench. APIs independently gate. */
export function ReviewServerActions({ itemId }: { itemId: string }) {
  const t = useMessages();
  const router = useRouter();
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [readings, setReadings] = useState<Retry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const responses = await Promise.all(['duplicates', 'reread'].map((suffix) =>
          fetch(`/api/items/${itemId}/${suffix}`, { signal: controller.signal, cache: 'no-store' })));
        if (responses.some((r) => !r.ok)) throw new Error('load');
        const [duplicates, retries] = await Promise.all(responses.map((r) => r.json()));
        setPairs(duplicates.data); setReadings(retries.data);
      } catch {
        if (!controller.signal.aborted) setError(t('phase2.failed'));
      }
    }
    void load();
    return () => controller.abort();
  }, [itemId, revision, t]);
  async function act(suffix: string, body?: object) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/items/${itemId}/${suffix}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}),
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error?.message ?? t('phase2.failed')); return; }
      setConfirmation(null);
      if (body && 'resolution' in body && body.resolution === 'merged') router.push(`/review/${result.data.keptId}`);
      setRevision((n) => n + 1); router.refresh();
    } catch { setError(t('phase2.failed')); }
    finally { setBusy(false); }
  }
  if (!pairs.length && !readings.length && !error) return null;
  return <section className="space-y-4 lg:col-span-2" aria-label={t('phase2.checks')} aria-busy={busy}>
    {error && <p role="alert" className="text-critical">{error}</p>}
    {pairs.length > 0 && <div className="rounded-xl border border-accent/30 bg-accent-wash p-5">
      <h2 className="font-display text-2xl">{t('duplicates.title')}</h2>
      <ul className="mt-3 space-y-4">{pairs.map((pair) => <li key={pair.id} className="space-y-3">
        <Link href={`/review/${pair.item.id}`} className="flex min-h-11 items-center gap-3 break-words underline focus-visible:outline-2 focus-visible:outline-accent">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {pair.item.thumbnail && <img alt="" src={pair.item.thumbnail} width={56} height={56} className="h-14 w-14 rounded-lg object-cover" />}
          <span dir="auto" className="min-w-0">{pair.item.title}</span>
        </Link>
        <p>{t(pair.reason === 'same_content' ? 'duplicates.strong' : 'duplicates.weak')}</p>
        {confirmation === pair.id ? <div className="space-y-3 rounded-lg border border-rule bg-paper p-4">
          <p role="alert">{t('duplicates.confirm')}</p>
          <div className="flex flex-wrap gap-3">
            <button className={button} disabled={busy} onClick={() => void act('duplicates', { pairId: pair.id, resolution: 'merged' })}>{t('duplicates.confirmButton')}</button>
            <button className={button} disabled={busy} onClick={() => setConfirmation(null)}>{t('phase2.cancel')}</button>
          </div>
        </div> : <div className="flex flex-wrap gap-3">
          <button className={button} disabled={busy} onClick={() => void act('duplicates', { pairId: pair.id, resolution: 'not_duplicate' })}>{t('duplicates.dismiss')}</button>
          <button className={button} disabled={busy} onClick={() => setConfirmation(pair.id)}>{t('duplicates.merge')}</button>
        </div>}
      </li>)}</ul>
    </div>}
    {readings.length > 0 && <div className="rounded-xl border border-rule bg-paper-2 p-5">
      <h2 className="font-display text-2xl">{t('retry.title')}</h2>
      {readings.map((reading) => <p key={reading.id} className="mt-2">{t(reading.running ? 'retry.running' : reading.count >= 3 ? 'retry.exhausted' : 'retry.tonight')}</p>)}
      <button className={`${button} mt-4`} disabled={busy || !readings.some((r) => r.eligible)} onClick={() => void act('reread')}>{t(busy ? 'retry.running' : 'retry.now')}</button>
    </div>}
  </section>;
}
