'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Plus, Trash2, X } from 'lucide-react';
import { buttonClass } from '@/components/primitives';
import { COMMUNITY_COLORS, COMMUNITY_ORDER } from '@/lib/communities';
import { COMMUNITY_LABELS, type Community, type Keyword, type KeywordCandidate } from '@/lib/types';

/**
 * The controlled vocabulary, and the queue of terms the model wants added to it.
 *
 * A record may carry no keyword that is not on this list. That is what makes
 * two volunteers cataloguing the same kind of object reach for the same word,
 * and it is why the second half exists: without somewhere for the model's own
 * suggestions to go, a closed list would slowly make the archive blind to
 * whatever nobody thought to type.
 */
export function VocabularyManager({
  keywords,
  candidates,
  isAdmin,
}: {
  keywords: Keyword[];
  candidates: KeywordCandidate[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [term, setTerm] = useState('');
  const [scope, setScope] = useState<Community | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const global = keywords.filter((k) => k.community === null);
    const byCommunity = COMMUNITY_ORDER.map((c) => ({
      community: c,
      terms: keywords.filter((k) => k.community === c),
    })).filter((g) => g.terms.length > 0);
    return { global, byCommunity };
  }, [keywords]);

  async function send(url: string, init: RequestInit): Promise<boolean> {
    setError(null);
    const response = await fetch(url, init);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? 'That did not go through. Try again.');
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!term.trim()) return;
    setBusyId('new');
    const done = await send('/api/manage/keywords', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ term: term.trim(), community: scope || null }),
    });
    if (done) setTerm('');
    setBusyId(null);
  }

  async function remove(keyword: Keyword) {
    setBusyId(keyword.id);
    await send(`/api/manage/keywords?id=${keyword.id}`, { method: 'DELETE' });
    setBusyId(null);
  }

  async function judge(candidate: KeywordCandidate, decision: 'accept' | 'decline') {
    setBusyId(candidate.id);
    await send(`/api/manage/candidates/${candidate.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    setBusyId(null);
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
      <section>
        <form onSubmit={add} className="mb-6 flex flex-wrap items-end gap-3">
          <label className="min-w-[16rem] flex-1">
            <span className="eyebrow mb-1.5 block">New term</span>
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              maxLength={60}
              placeholder="Synagogue"
              className="h-13 w-full rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:bg-accent-wash/30 focus:outline-none"
            />
          </label>

          <label>
            <span className="eyebrow mb-1.5 block">Offered for</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as Community | '')}
              className="h-13 rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:outline-none"
            >
              <option value="">Every community</option>
              {COMMUNITY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {COMMUNITY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={busyId === 'new' || !term.trim()}
            className={buttonClass('primary', 'h-13')}
          >
            {busyId === 'new' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Add
          </button>
        </form>

        {error && (
          <p role="alert" className="mb-5 rounded-lg border-l-[3px] border-critical bg-critical/8 px-3 py-2 text-sm text-critical">
            {error}
          </p>
        )}

        {keywords.length === 0 ? (
          <p className="rounded-xl border border-dashed border-rule-strong bg-paper-2/60 px-6 py-10 text-center text-muted">
            The vocabulary is empty. Until it has terms, records can carry no keywords at all.
          </p>
        ) : (
          <div className="space-y-7">
            {grouped.global.length > 0 && (
              <TermGroup
                heading="Every community"
                color={null}
                terms={grouped.global}
                isAdmin={isAdmin}
                busyId={busyId}
                onRemove={remove}
              />
            )}
            {grouped.byCommunity.map(({ community, terms }) => (
              <TermGroup
                key={community}
                heading={COMMUNITY_LABELS[community]}
                color={COMMUNITY_COLORS[community]}
                terms={terms}
                isAdmin={isAdmin}
                busyId={busyId}
                onRemove={remove}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl">Suggested by the model</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Words the analysis reached for that the vocabulary does not hold. The count is how many
          times it has come up.
        </p>

        {candidates.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-rule-strong bg-paper-2/60 px-5 py-8 text-center text-sm text-muted">
            Nothing waiting.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-rule border-y border-rule">
            {candidates.map((candidate) => (
              <li key={candidate.id} className="flex items-center gap-3 py-2.5">
                <span className="flex-1">
                  {candidate.term}
                  {candidate.community && (
                    <span className="ml-2 text-xs text-muted">
                      {COMMUNITY_LABELS[candidate.community]}
                    </span>
                  )}
                </span>
                <span className="font-mono text-xs text-muted">×{candidate.seen_count}</span>
                <button
                  type="button"
                  onClick={() => judge(candidate, 'accept')}
                  disabled={busyId === candidate.id}
                  title="Add to the vocabulary"
                  className="rounded p-2 text-positive transition-colors hover:bg-positive/10 disabled:opacity-40"
                >
                  <Check size={17} />
                  <span className="sr-only">Add {candidate.term} to the vocabulary</span>
                </button>
                <button
                  type="button"
                  onClick={() => judge(candidate, 'decline')}
                  disabled={busyId === candidate.id}
                  title="Not a term for this archive"
                  className="rounded p-2 text-muted transition-colors hover:bg-paper-3 disabled:opacity-40"
                >
                  <X size={17} />
                  <span className="sr-only">Decline {candidate.term}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pending && <span className="sr-only">Saving</span>}
    </div>
  );
}

function TermGroup({
  heading,
  color,
  terms,
  isAdmin,
  busyId,
  onRemove,
}: {
  heading: string;
  color: string | null;
  terms: Keyword[];
  isAdmin: boolean;
  busyId: string | null;
  onRemove: (keyword: Keyword) => void;
}) {
  return (
    <div>
      <h3 className="eyebrow mb-2.5 flex items-center gap-2">
        {color && (
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        )}
        {heading}
        <span className="font-mono normal-case">{terms.length}</span>
      </h3>
      <ul className="flex flex-wrap gap-2">
        {terms.map((keyword) => (
          <li
            key={keyword.id}
            className="flex items-center gap-1.5 rounded-full border border-rule bg-paper-2 py-2 pr-2 pl-4 text-sm transition-colors hover:border-accent-strong"
          >
            {keyword.term}
            {isAdmin && (
              <button
                type="button"
                onClick={() => onRemove(keyword)}
                disabled={busyId === keyword.id}
                className="rounded-full p-1 text-muted transition-colors hover:bg-critical/10 hover:text-critical disabled:opacity-40"
              >
                <Trash2 size={13} />
                <span className="sr-only">Remove {keyword.term}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
