'use client';

import { useEffect, useRef, useState } from 'react';
import { useMessages } from '@/lib/i18n/provider';
import { DraftPayload, type ReviewDraftPayload } from '@/lib/items/draft-schema';
import { useDraftReadings } from './review-draft-scope';

function serializeDraft(value: ReviewDraftPayload): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
}

export function ReviewDraftControls({ itemId, value, restore, deciding }: {
  itemId: string; value: ReviewDraftPayload; restore: (value: ReviewDraftPayload) => void; deciding: boolean;
}) {
  const t = useMessages();
  const readings = useDraftReadings();
  const combined = { ...value, readings: readings?.readings ?? [] };
  const latest = useRef({ value: combined, restore, deciding, restoreReadings: readings?.restore });
  const baseline = useRef(serializeDraft(combined));
  const original = useRef(serializeDraft(combined));
  const discardedSnapshot = useRef<string | null>(null);
  const saving = useRef(false);
  const ready = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [hasDraft, setHasDraft] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { latest.current = { value: combined, restore, deciding, restoreReadings: readings?.restore }; });

  useEffect(() => {
    const controller = new AbortController();
    const initial = baseline.current;
    void fetch(`/api/items/${itemId}/draft`, { signal: controller.signal }).then(r => r.json()).then(body => {
      if (!body.ok) throw new Error(body.error.message);
      if (body.data) {
        const parsed = DraftPayload.safeParse(body.data.payload);
        if (!parsed.success) throw new Error(t('review3.failed'));
        setHasDraft(true);
        // A slow response must never overwrite edits already made on this visit.
        if ((parsed.data.baseReviewedAt ?? null) === (latest.current.value.baseReviewedAt ?? null) && serializeDraft(latest.current.value) === initial) {
          latest.current.restore(parsed.data);
          latest.current.restoreReadings?.(parsed.data.readings ?? []);
          baseline.current = serializeDraft({ ...latest.current.value, ...parsed.data, readings: parsed.data.readings ?? [] });
          setMessage(t('review3.restored', { time: new Date(body.data.updated_at).toLocaleString() }));
        } else setMessage(t('review3.draftNotRestored'));
      }
      ready.current = true;
      setLoaded(true);
    }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [itemId, t]);

  async function save() {
    if (saving.current || !ready.current || latest.current.deciding) return;
    saving.current = true;
    setBusy(true);
    const snapshot = serializeDraft(latest.current.value);
    try {
      const response = await fetch(`/api/items/${itemId}/draft`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: snapshot,
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error.message);
      baseline.current = snapshot;
      discardedSnapshot.current = null;
      setHasDraft(true);
      setMessage(t('review3.saved'));
    } catch (error) { setMessage(error instanceof Error ? error.message : t('review3.failed')); }
    finally { saving.current = false; setBusy(false); }
  }
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });
  useEffect(() => {
    const timer = window.setInterval(() => {
      const snapshot = serializeDraft(latest.current.value);
      if (snapshot !== baseline.current && snapshot !== discardedSnapshot.current) void saveRef.current();
    }, 30000);
    const dirty = () => !latest.current.deciding && serializeDraft(latest.current.value) !== baseline.current;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } };
    const click = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest('a[href]');
      if (link && dirty() && !window.confirm(t('review3.leave'))) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', click, true);
    return () => { clearInterval(timer); window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', click, true); };
  }, [t]);

  async function discard() {
    if (!window.confirm(t('review3.discardConfirm'))) return;
    saving.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/items/${itemId}/draft`, { method: 'DELETE' });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error.message);
      setHasDraft(false);
      // Explicit discard keeps the current form, without immediately recreating its draft.
      discardedSnapshot.current = serializeDraft(latest.current.value);
      baseline.current = original.current;
      setMessage(t('review3.discarded'));
    } catch (error) { setMessage(error instanceof Error ? error.message : t('review3.failed')); }
    finally { saving.current = false; setBusy(false); }
  }
  return <div className="mb-4 space-y-2">
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={save} disabled={!loaded || busy || deciding} className="min-h-11 rounded-full border border-rule-strong bg-paper px-5 font-medium focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-50">{t('review3.saveDraft')}</button>
      {hasDraft && <button type="button" onClick={discard} disabled={busy || deciding} className="min-h-11 rounded-full border border-rule px-5 focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-50">{t('review3.discard')}</button>}
    </div>
    {!loaded && message && <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-full border border-rule px-5 focus-visible:outline-2 focus-visible:outline-offset-4">{t('review3.reloadDraft')}</button>}
    <p role="status" aria-live="polite" className="text-sm text-muted">{message}</p>
  </div>;
}
