'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { buttonClass } from '@/components/primitives';
import { useMessages } from '@/lib/i18n/provider';
import { normalise, normaliseChosen } from '@/lib/vocabulary/thesaurus';

export function TagPicker({ chosen, offered, suggested, onChange, expert = false, disabled = false, onBusyChange }: {
  chosen: string[];
  offered: { term: string; variants: string[] }[];
  suggested: string[];
  onChange: (keywords: string[]) => void;
  expert?: boolean;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const t = useMessages();
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState('');
  const latest = useRef({ chosen, offered, onChange });
  useLayoutEffect(() => { latest.current = { chosen, offered, onChange }; }, [chosen, offered, onChange]);
  const selected = normaliseChosen(offered, chosen);
  const needle = normalise(query);
  const canonical = (word: string) => normaliseChosen(offered, [word])[0];
  const has = (word: string) => selected.some(value => normalise(value) === normalise(canonical(word) ?? ''));
  const known = (word: string) => offered.some(term => [term.term, ...term.variants].some(value => normalise(value) === normalise(word)));
  const matches = offered.filter(term => !has(term.term) && [term.term, ...term.variants].some(value => normalise(value).includes(needle)));
  const suggestions = normaliseChosen(offered, suggested).filter(term => !has(term));
  const valid = query.trim().length > 0 && query.trim().length <= 80;
  const locked = disabled || busy;
  const control = buttonClass('quiet', 'min-h-11 h-auto max-w-full whitespace-normal break-words py-2 focus-visible:outline-2 focus-visible:outline-offset-2');

  async function add(raw: string) {
    if (inFlight.current || disabled || !raw.trim() || raw.trim().length > 80 || has(raw)) return;
    let term = canonical(raw);
    setError('');
    if (expert && !known(raw)) {
      inFlight.current = true;
      setBusy(true);
      onBusyChange?.(true);
      try {
        const response = await fetch('/api/manage/keywords', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ term: raw.trim(), community: null }),
        });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error?.message ?? t('review3.failed'));
        term = body.data.keyword.term;
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : t('review3.failed'));
        return;
      } finally {
        setBusy(false);
        inFlight.current = false;
        onBusyChange?.(false);
      }
    }
    const current = latest.current;
    current.onChange(normaliseChosen(current.offered, [...current.chosen, term]));
    setQuery('');
    setOpen(false);
  }

  return <fieldset disabled={locked} className="min-w-0 space-y-3">
    <legend className="mb-2 font-medium">{t('prereview.yourTags')}</legend>
    <ul className="flex flex-wrap gap-2" aria-live="polite">
      {selected.map(term => <li key={term} className="flex max-w-full flex-wrap items-center gap-2 break-words rounded-xl border border-rule bg-paper px-3 py-1">
        <span dir="auto" className="min-w-0 break-all">{term}</span>
        {!expert && !known(term) && <span className="text-sm text-muted">{t('tags.proposed')}</span>}
        <button type="button" className={control} aria-label={t('prereview.removeTag', { term })}
          onClick={() => onChange(selected.filter(value => value !== term))}>{t('public.removeTag')}</button>
      </li>)}
    </ul>
    <label htmlFor={id} className="block">{t('prereview.addTag')}</label>
    <input id={id} value={query} dir="auto" maxLength={80}
      onChange={event => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
      onKeyDown={event => {
        if (event.key === 'Escape') setOpen(false);
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); if (valid) void add(query); }
      }}
      className="min-h-11 w-full min-w-0 rounded-lg border border-rule bg-paper px-3 focus-visible:outline-2 focus-visible:outline-accent-strong" />
    {valid && !has(query) && !known(query) && <button type="button" className={control} onClick={() => void add(query)}>
      {known(query) ? t('review3.useTerm', { term: canonical(query) }) : t(expert ? 'tags.create' : 'public.suggestTag', { text: query.trim() })}
    </button>}
    {open && <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-rule bg-paper p-1">
      {matches.map(term => <li key={term.term}><button type="button" className={`${control} w-full text-start`} onClick={() => void add(term.term)}>
        <span dir="auto" className="break-all">{term.term}{needle && !normalise(term.term).includes(needle) && ` · ${term.variants.find(value => normalise(value).includes(needle))}`}</span>
      </button></li>)}
      {!matches.length && <li className="p-3 text-muted">{t('prereview.tagsNoMatch')}</li>}
    </ul>}
    {suggestions.length > 0 && <div>
      <p className="mb-2">{t('prereview.tagsSuggested')}</p>
      <div className="flex flex-wrap gap-2">{suggestions.map(term => <button type="button" key={term} className={control} onClick={() => void add(term)}><span dir="auto" className="break-all">{term}</span></button>)}</div>
    </div>}
    <p className="text-sm text-muted">{t(expert ? 'tags.expertHint' : 'public.tagsHint')}</p>
    {busy && <p role="status">{t('review3.loading')}</p>}
    {error && <p role="alert" className="text-critical">{error}</p>}
  </fieldset>;
}
