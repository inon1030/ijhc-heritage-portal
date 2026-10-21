'use client';
import { TagPicker } from './tag-picker';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMessages } from '@/lib/i18n/provider';
import { categoryKey } from '@/lib/i18n/labels';
import { CATEGORIES, type ItemDetail, type ItemCategory, type AccessLevel } from '@/lib/types';
import { ACCESS_LEVELS } from '@/lib/access';
import { fieldDef } from '@/lib/fields/registry';
import type { ReviewCandidate } from '@/lib/items/queries';
import { normaliseChosen, resolveTerms, type VocabularyTerm } from '@/lib/vocabulary/thesaurus';

type Row = { item: ItemDetail; familyIds: string[]; candidates: ReviewCandidate[]; category: ItemCategory | ''; access: AccessLevel; keywords: string[] };
const button = 'min-h-11 rounded-full border border-rule-strong bg-paper px-5 font-medium focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-50';

export function ReviewBulkTable({ ids, close, completed }: { ids: string[]; close: () => void; completed: (ids: string[]) => void }) {
  const t = useMessages();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabularyTerm[]>([]);
  const [busy, setBusy] = useState(false);
  const [tagsBusy, setTagsBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(ids.map(id => ['id', id]));
    void fetch(`/api/items/bulk-review?${query}`, { signal: controller.signal }).then(r => r.json()).then(body => {
      if (!body.ok) throw new Error(body.error.message);
      setVocabulary(body.data.vocabulary);
      setRows(body.data.items.map((row: Pick<Row, 'item' | 'familyIds' | 'candidates'>) => ({
        ...row, category: row.item.category ?? '', access: row.item.access, keywords: normaliseChosen(body.data.vocabulary, row.item.keywords),
      })));
      if (body.data.items.length !== ids.length) setError(t('review3.changed'));
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [ids, t]);
  function patch(id: string, value: Partial<Row>) { setRows(previous => previous.map(row => row.item.id === id ? { ...row, ...value } : row)); }
  const eligible = rows.filter(row => row.category && !results[row.item.id]?.ok);
  async function approve() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/items/bulk-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: eligible.map(row => ({
          id: row.item.id,
          review: {
            title: row.item.title, description: row.item.description, category: row.category,
            community: row.item.community, provenance: row.item.provenance, language: row.item.language,
            period: row.item.period, originPlace: row.item.origin_place, access: row.access,
            keywords: row.keywords, familyIds: row.familyIds,
            fields: row.item.fields.filter(field => field.source !== 'ai' && !fieldDef(field.field_key)?.column)
              .map(field => ({ key: field.field_key, value: field.value })),
          },
        })) }),
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error.message);
      setResults(previous => {
        const next = { ...previous };
        for (const result of body.data.results) {
          next[result.id] = { ok: result.ok, message: result.ok ? t('review3.approved') : result.error.message };
        }
        return next;
      });
      // Derive independently of React's updater (which may be replayed).
      completed(body.data.results.filter((result: { ok: boolean }) => result.ok).map((result: { id: string }) => result.id));
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t('review3.failed')); }
    finally { setBusy(false); }
  }
  return <section aria-labelledby="bulk-title" className="my-6 min-w-0 rounded-2xl border border-rule-strong bg-paper p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="bulk-title" className="font-display text-2xl">{t('review3.batchReview')}</h2>
      <button type="button" className={button} disabled={busy || tagsBusy} onClick={close}>{t('review3.close')}</button>
    </div>
    <p className="my-3 text-muted">{t('review3.batchNote')}</p>
    {!rows.length && !error && <p role="status">{t('review3.loading')}</p>}
    <div className="max-w-full overflow-x-auto">
      <table className="w-full table-fixed text-start">
        <caption className="sr-only">{t('review3.batchReview')}</caption>
        <thead className="hidden lg:table-header-group"><tr>{(['title', 'category', 'tags', 'access', 'result'] as const).map(key => <th key={key} scope="col" className="p-3 text-start">{t(`review3.${key}`)}</th>)}</tr></thead>
        <tbody className="block lg:table-row-group">{rows.map(row => {
          const disabled = busy || tagsBusy || results[row.item.id]?.ok;
          const suggestions = normaliseChosen(vocabulary, [...row.item.keywords, ...(row.item.analysis?.keywords ?? []), ...row.item.contributor_keywords, ...row.candidates.map(c => c.term)]);
          return <tr key={row.item.id} className="mb-4 block rounded-xl border border-rule p-3 lg:table-row lg:border-x-0">
            <th scope="row" className="block break-words py-3 text-start font-medium lg:table-cell lg:p-3"><span dir="auto">{row.item.title}</span></th>
            <td className="block py-3 align-top lg:table-cell lg:p-3">
              <label className="block">{t('review3.category')}
                <select value={row.category} disabled={disabled} onChange={e => patch(row.item.id, { category: e.target.value as ItemCategory | '' })} className="mt-2 min-h-11 w-full rounded-lg border border-rule bg-paper px-2 focus-visible:outline-2">
                  <option value="">{t('category.none')}</option>
                  {CATEGORIES.map(category => <option key={category} value={category}>{t(categoryKey(category))}</option>)}
                </select>
              </label>
              {!row.category && <p className="mt-2 text-caution">{t('wb.categoryRequired')}</p>}
            </td>
            <td className="block py-3 align-top lg:table-cell lg:p-3">
              <fieldset><legend>{t('review3.tags')}</legend>{suggestions.map(term => {
                const resolved = resolveTerms(vocabulary, [term])[0];
                const canonical = resolved ?? term;
                const checked = row.keywords.includes(canonical);
                return <label key={term} className="flex min-h-11 cursor-pointer items-center gap-2 break-words py-2">
                  <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--color-accent-strong)]" checked={checked} disabled={disabled} onChange={e => patch(row.item.id, {
                    keywords: e.target.checked ? [...new Set([...row.keywords, canonical])] : row.keywords.filter(k => k !== canonical),
                  })} />
                  <span dir="auto">{term}{!resolved && <span className="block text-sm text-muted">{t('review3.newTerm')}</span>}</span>
                </label>;
              })}</fieldset>
              <TagPicker expert onBusyChange={setTagsBusy} disabled={disabled} chosen={row.keywords} offered={vocabulary} suggested={[]}
                onChange={keywords => patch(row.item.id, { keywords })} />
            </td>
            <td className="block py-3 align-top lg:table-cell lg:p-3"><label>{t('review3.access')}
              <select value={row.access} disabled={disabled} onChange={e => patch(row.item.id, { access: e.target.value as AccessLevel })} className="mt-2 min-h-11 w-full rounded-lg border border-rule bg-paper px-2 focus-visible:outline-2">
                {ACCESS_LEVELS.map(access => <option key={access} value={access}>{t(`review3.access.${access}`)}</option>)}
              </select>
            </label></td>
            <td className="block break-words py-3 align-top lg:table-cell lg:p-3" role="status">{results[row.item.id]?.message}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <button type="button" className={button} disabled={busy || tagsBusy || !eligible.length} onClick={approve}>{t('review3.approveRecords', { count: eligible.length })}</button>
    {error && <p role="alert" className="mt-3 text-critical">{error}</p>}
  </section>;
}
