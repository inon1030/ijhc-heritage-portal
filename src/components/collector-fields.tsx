'use client';
import { useId } from 'react';
import { useMessages } from '@/lib/i18n/provider';

export function CollectorFields({ name, required, onName, onRequired, disabled = false }: {
  name: string; required: boolean; onName: (name: string) => void;
  onRequired: (required: boolean) => void; disabled?: boolean;
}) {
  const t = useMessages();
  const id = useId();
  return <fieldset className="mt-5 min-w-0 space-y-2 rounded-xl border border-rule p-4">
    <legend className="px-2 font-medium">{t('public.collector')}</legend>
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <input type="checkbox" checked={required} onChange={e => onRequired(e.target.checked)} disabled={disabled} className="h-5 w-5 shrink-0" />
      {t('public.collectorCredit')}
    </label>
    <label htmlFor={id} className="block">{t('public.collectorName')}</label>
    <input id={id} value={name} onChange={e => onName(e.target.value)} required={required} maxLength={200}
      disabled={disabled} dir="auto" aria-describedby={`${id}-hint`}
      className="min-h-11 w-full rounded-lg border border-rule bg-paper px-3 focus-visible:outline-2 focus-visible:outline-accent-strong" />
    <p id={`${id}-hint`} className="text-sm text-muted">{t(required && !name.trim() ? 'public.collectorRequired' : 'public.collectorHint')}</p>
  </fieldset>;
}
