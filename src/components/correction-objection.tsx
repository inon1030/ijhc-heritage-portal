'use client';
import { useState } from 'react';
import { useMessages } from '@/lib/i18n/provider';
import { buttonClass } from './primitives';
export function CorrectionObjection({ id, token }: { id: string; token: string }) {
  const t = useMessages();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('');
  return <form className="mt-6 space-y-4" onSubmit={async event => {
    event.preventDefault();
    if (busy || done) return;
    const note = new FormData(event.currentTarget).get('note');
    setBusy(true);
    try {
      const response = await fetch(`/api/corrections/${id}/objection`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, note }) });
      const result = await response.json();
      setMessage(result.ok ? t('public.objectThanks') : result.error.message);
      if (result.ok) setDone(true);
    } catch { setMessage(t('public.failed')); }
    finally { setBusy(false); }
  }}>
    <label className="block"><span className="mb-2 block">{t('public.note')}</span>
      <textarea name="note" maxLength={2000} rows={5} disabled={busy || done} dir="auto"
        className="min-h-11 w-full rounded-lg border border-rule bg-paper p-3 focus-visible:outline-2 focus-visible:outline-accent-strong" /></label>
    <button className={buttonClass('accent', 'min-h-11 h-auto whitespace-normal py-3')} disabled={busy || done}>{t(busy ? 'public.sending' : 'public.object')}</button>
    <p role="status">{message}</p>
  </form>;
}
