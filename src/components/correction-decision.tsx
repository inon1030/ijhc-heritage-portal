'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMessages } from '@/lib/i18n/provider';
import { buttonClass } from './primitives';
export function CorrectionDecision({ id, objectionAt }: { id: string; objectionAt: string | null }) {
  const t = useMessages();
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function decide(accept: boolean) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/corrections/${id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept, objectionAt }) });
      const result = await response.json();
      if (!result.ok) setMessage(result.error.message);
      else { setMessage(t('public.decided')); router.refresh(); }
    } catch { setMessage(t('public.failed')); }
    finally { setBusy(false); }
  }
  return <div className="mt-5">
    {objectionAt && <label className="mb-3 flex min-h-11 items-center gap-3">
      <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} className="h-5 w-5" />{t('public.acknowledge')}
    </label>}
    <div className="flex flex-wrap gap-3">
      <button className={buttonClass('accent')} disabled={busy || Boolean(objectionAt && !acknowledged)} onClick={() => decide(true)}>{t('public.accept')}</button>
      <button className={buttonClass('quiet')} disabled={busy} onClick={() => decide(false)}>{t('public.decline')}</button>
    </div>
    <p role="status" className="mt-3">{message}</p>
  </div>;
}
