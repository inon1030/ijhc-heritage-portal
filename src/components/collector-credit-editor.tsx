'use client';
import { useState } from 'react';
import { useMessages } from '@/lib/i18n/provider';
import { CollectorFields } from './collector-fields';
import { buttonClass } from './primitives';

/** Rendered only inside the expert workbench; the endpoint and RLS also gate edits. */
export function CollectorCreditEditor({ itemId, initialName, initialRequired }: {
  itemId: string; initialName?: string | null; initialRequired?: boolean;
}) {
  const t = useMessages();
  const [name, setName] = useState(initialName ?? '');
  const [required, setRequired] = useState(initialRequired ?? false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return <section className="col-span-full">
    <CollectorFields name={name} required={required} onName={setName} onRequired={setRequired} disabled={busy} />
    <button type="button" className={buttonClass('quiet', 'mt-3')} disabled={busy || (required && !name.trim())} onClick={async () => {
      setBusy(true); setMessage('');
      try {
        const response = await fetch(`/api/records/${itemId}/moderation`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collectorName: name.trim() || null, collectorCreditRequired: required }) });
        const result = await response.json();
        setMessage(result.ok ? t('public.creditSaved') : result.error.message);
      } catch { setMessage(t('public.failed')); }
      finally { setBusy(false); }
    }}>{t(busy ? 'public.sending' : 'public.saveCollector')}</button>
    <p role="status" className="mt-2">{message}</p>
  </section>;
}
