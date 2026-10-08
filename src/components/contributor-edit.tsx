'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMessages } from '@/lib/i18n/provider';

export function ContributorEditForm({ itemId, token, title, description }: {
  itemId: string; token: string; title: string; description: string | null;
}) {
  const t = useMessages();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draftTitle, setTitle] = useState(title);
  const [draftDescription, setDescription] = useState(description ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [closed, setClosed] = useState('');
  const lastSaved = useRef({ title, description: description ?? '' });
  const action = useRef<HTMLButtonElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) titleInput.current?.focus();
    else if (wasOpen.current) action.current?.focus();
    wasOpen.current = open;
  }, [open]);
  const saving = useRef(false);
  const control = 'min-h-11 rounded-lg border border-rule bg-paper px-4 py-2 focus-visible:outline-2 focus-visible:outline-accent-strong disabled:opacity-60';

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const response = await fetch(`/api/items/${itemId}/contributor-edit?t=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: draftTitle, contributorDescription: draftDescription }),
      });
      const body = await response.json();
      if (response.status === 409) {
        const code = body?.error?.code;
        setClosed(t(code === 'receipt.editPublished' ? 'receipt.editPublished'
          : code === 'receipt.editWithdrawn' ? 'receipt.editWithdrawn' : 'receipt.editReviewed'));
        router.refresh();
        return;
      }
      if (!response.ok || !body?.ok) {
        setError(response.status === 403 ? t('receipt.badLinkBody')
          : response.status === 429 ? body.error.message : t('receipt.editError'));
        return;
      }
      setTitle(draftTitle.trim());
      setDescription(draftDescription.trim());
      lastSaved.current = { title: draftTitle.trim(), description: draftDescription.trim() };
      setSaved(true);
      setOpen(false);
      router.refresh();
    } catch {
      setError(t('receipt.editError'));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  if (closed) return <p role="status" tabIndex={-1} ref={(node) => node?.focus()} className="mt-6">{closed}</p>;
  return (
    <section className="mt-6 min-w-0 rounded-xl border border-rule bg-paper p-4">
      <button ref={action} type="button" className={control} aria-expanded={open} aria-controls="contributor-edit-form"
        hidden={open} onClick={() => { setOpen(true); setSaved(false); setError(''); }}>
        {t('receipt.editAction')}
      </button>
      {saved && <p role="status" className="mt-3">{t('receipt.editSaved')}</p>}
      {open && <form id="contributor-edit-form" aria-label={t('receipt.editAction')} onSubmit={save}>
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <legend className="mb-3 font-display text-xl">{t('receipt.editAction')}</legend>
          <p>{t('receipt.editScope')}</p>
          <label className="block">
            <span className="mb-1 block">{t('receipt.editTitle')}</span>
            <input ref={titleInput} dir="auto" required maxLength={200}
              value={draftTitle} onChange={(e) => setTitle(e.target.value)} className={`${control} w-full`} />
          </label>
          <label className="block">
            <span className="mb-1 block">{t('receipt.editDescription')}</span>
            <textarea dir="auto" maxLength={4000} rows={6} value={draftDescription}
              onChange={(e) => setDescription(e.target.value)} className={`${control} w-full resize-y`} />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={!draftTitle.trim()} className={control}>{t(busy ? 'receipt.editSaving' : 'receipt.editSave')}</button>
            <button type="button" className={control} onClick={() => {
              setTitle(lastSaved.current.title); setDescription(lastSaved.current.description); setError(''); setOpen(false);
            }}>{t('receipt.editCancel')}</button>
          </div>
        </fieldset>
        {error && <p role="alert" className="mt-3">{error}</p>}
      </form>}
    </section>
  );
}
