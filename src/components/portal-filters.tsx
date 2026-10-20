'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LayoutGrid, List, Search, X } from 'lucide-react';
import { buttonClass } from '@/components/primitives';
import { useMessages } from '@/lib/i18n/provider';
import { categoryKey, communityKey } from '@/lib/i18n/labels';
import type { Community, ItemCategory } from '@/lib/types';
import { FACETS, type Facet, type FacetOptions } from '@/lib/items/portal-facets';
import { fieldDef } from '@/lib/fields/registry';
import { fieldLabel } from '@/lib/fields/labels';
import type { MessageKey } from '@/lib/i18n/messages';

export function PortalFilters(props: { view: string; options: FacetOptions; shown: number; total: number }) {
  const params = useSearchParams();
  // A history navigation remounts local input state from its URL, including Back.
  return <FilterForm key={params.toString()} {...props} />;
}

function FilterForm({ view, options, shown, total }: { view: string; options: FacetOptions; shown: number; total: number }) {
  const t = useMessages();
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(params.get('q') ?? '');
  const [email, setEmail] = useState(params.get('contributor') ?? '');
  const activeKeys = [...FACETS, 'q', 'contributor', 'from', 'to'].filter(key => params.get(key));
  const advanced = [...FACETS.slice(2), 'contributor', 'from', 'to'].some(key => params.has(key));
  const control = 'min-h-11 w-full min-w-0 rounded-lg border border-rule bg-paper px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-accent-strong';

  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    next.delete('page');
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    startTransition(() => router.push(`/portal?${next}`, { scroll: false }));
  }
  function label(key: string) {
    return t(key === 'q' ? 'filters.text' : key === 'contributor' ? 'filters.contributor' : `filters.${key}` as MessageKey);
  }
  function valueLabel(key: Facet, value: string, fallback = value) {
    if (key === 'community') return t(communityKey(value as Community));
    if (key === 'category') return t(categoryKey(value as ItemCategory));
    if (key === 'kind') return t(`filters.${value}` as MessageKey);
    if (key === 'field') {
      try { const def = fieldDef(JSON.parse(value)[0]); if (def) return fieldLabel(t, def); } catch { /* malformed URL stays removable */ }
    }
    return options[key].find(o => o.value === value)?.label ?? fallback;
  }
  function select(key: Facet) {
    const selected = params.get(key) ?? '';
    return <label key={key} className="block min-w-0">
      <span className="mb-1.5 block font-medium">{label(key)}</span>
      <select className={control} value={selected} onChange={e => apply({ [key]: e.target.value })}>
        <option value="">{t('filters.all')}</option>
        {selected && !options[key].some(o => o.value === selected) && <option value={selected}>{valueLabel(key, selected)} (0)</option>}
        {options[key].map(o => <option key={o.value} value={o.value}>{valueLabel(key, o.value, o.label)} ({o.count})</option>)}
      </select>
    </label>;
  }
  return <div className="border-b border-rule pb-4" aria-busy={pending}>
    <form onSubmit={e => { e.preventDefault(); apply({ q: text.trim(), contributor: email.trim() }); }}>
      <div className="grid items-end gap-3 md:grid-cols-[2fr_1fr_1fr]">
        <label className="block min-w-0"><span className="mb-1.5 block font-medium">{t('filters.text')}</span>
          <span className="flex gap-2"><input className={control} value={text} onChange={e => setText(e.target.value)} />
            <button type="submit" className={buttonClass('quiet', 'min-h-11 shrink-0 px-4')}><Search size={16} aria-hidden />{t('filters.search')}</button></span>
        </label>
        {select('community')}{select('category')}
      </div>
      <details className="mt-3" open={advanced || undefined}>
        <summary className="flex min-h-11 w-fit cursor-pointer items-center rounded-lg px-2 font-medium text-accent focus-visible:outline-2">{t('filters.advanced')}</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FACETS.slice(2).map(select)}
          {(['from', 'to'] as const).map(key => <label key={key} className="block min-w-0">
            <span className="mb-1.5 block font-medium">{label(key)}</span>
            <input type="date" className={control} value={params.get(key) ?? ''}
              min={key === 'to' ? params.get('from') ?? undefined : undefined}
              max={key === 'from' ? params.get('to') ?? undefined : undefined}
              onChange={e => apply({ [key]: e.target.value })} />
          </label>)}
          <label className="block min-w-0"><span className="mb-1.5 block font-medium">{t('filters.contributor')}</span>
            <input dir="ltr" type="email" className={control} value={email} onChange={e => setEmail(e.target.value)} />
          </label>
        </div>
        <button type="submit" className={buttonClass('quiet', 'mt-3 min-h-11')}>{t('filters.search')}</button>
      </details>
    </form>
    {activeKeys.length > 0 && <div className="mt-3 flex flex-wrap gap-2">
      {activeKeys.map(key => <button key={key} type="button" onClick={() => apply({ [key]: null })}
        aria-label={t('filters.remove', { name: label(key) })}
        className={buttonClass('quiet', 'min-h-11 h-auto max-w-full whitespace-normal break-words px-3 py-2')}>
        <X size={16} className="shrink-0" aria-hidden />{label(key)}: {FACETS.includes(key as Facet) ? valueLabel(key as Facet, params.get(key)!) : params.get(key)}
      </button>)}
      <button type="button" className={buttonClass('quiet', 'min-h-11')} onClick={() => startTransition(() => router.push('/portal', { scroll: false }))}>{t('filters.clear')}</button>
    </div>}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="text-sm text-muted">{pending ? t('controls.updating') : t('filters.showing', { shown, total })}</p>
      <div className="flex flex-wrap gap-2">
        {(['grid','list'] as const).map(mode => <button key={mode} type="button" aria-pressed={view === mode}
          onClick={() => apply({ view: mode })} className={buttonClass('quiet', 'min-h-11 px-3')}>
          {mode === 'grid' ? <LayoutGrid size={16} aria-hidden /> : <List size={16} aria-hidden />}{t(mode === 'grid' ? 'controls.grid' : 'controls.list')}
        </button>)}
      </div>
    </div>
  </div>;
}
