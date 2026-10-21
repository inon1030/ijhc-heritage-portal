'use client';
import { useEffect, useState } from 'react';
import { useMessages } from '@/lib/i18n/provider';
import type { ReviewCandidate } from '@/lib/items/queries';

export function ReviewCandidates({ itemId, keywords, onChange }: { itemId: string; keywords: string[]; onChange: (terms: string[]) => void }) {
  const t = useMessages();
  const [candidates, setCandidates] = useState<ReviewCandidate[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/items/${itemId}/candidates`, { signal: controller.signal }).then(r => r.json())
      .then(body => { if (!body.ok) throw new Error(body.error.message); setCandidates(body.data); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [itemId]);
  async function decide(candidate: ReviewCandidate, action: 'create' | 'decline', replacement?: string) {
    setBusy(candidate.id);
    setError('');
    try {
      const response = await fetch(`/api/items/${itemId}/candidates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: candidate.id, action }),
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error.message);
      const term = replacement ?? (action === 'create' ? body.data.term : null);
      if (term) onChange([...new Set([...keywords, term])]);
      setCandidates(rows => rows.filter(row => row.id !== candidate.id));
    } catch (e) { setError(e instanceof Error ? e.message : t('review3.failed')); }
    finally { setBusy(null); }
  }
  if (!candidates.length && !error) return null;
  return <section className="my-5 rounded-xl border border-rule bg-paper-2 p-4">
    <h3 className="font-display text-xl">{t('review3.suggestions')}</h3>
    <p className="mt-2 text-sm text-muted">{t('review3.suggestionsNote')}</p>
    <ul className="mt-3 divide-y divide-rule">{candidates.map(candidate => <li key={candidate.id} className="py-4">
      <p className="break-words font-medium" dir="auto">{candidate.term} <span className="text-sm text-muted">· {t(candidate.source === 'contributor' ? 'review3.contributor' : 'review3.ai')}</span></p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy !== null} onClick={() => decide(candidate, 'create')} className="min-h-11 rounded-full border border-rule-strong bg-paper px-4 focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-50">{t('review3.createTerm')}</button>
        {candidate.similar.map(term => <button key={term.id} type="button" disabled={busy !== null} onClick={() => decide(candidate, 'decline', term.term)} className="min-h-11 max-w-full break-words rounded-full border border-rule bg-paper px-4 focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-50">{t('review3.useTerm', { term: term.term })}</button>)}
        <button type="button" disabled={busy !== null} onClick={() => decide(candidate, 'decline')} className="min-h-11 rounded-full border border-rule px-4 focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-50">{t('review3.decline')}</button>
      </div>
    </li>)}</ul>
    {error && <p role="alert" className="mt-3 text-critical">{error}</p>}
  </section>;
}
