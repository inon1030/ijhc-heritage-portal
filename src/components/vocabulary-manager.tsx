'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Merge, Plus, Trash2, X } from 'lucide-react';
import { buttonClass } from '@/components/primitives';
import { COMMUNITY_COLORS, COMMUNITY_ORDER } from '@/lib/communities';
import { FIELD_GROUPS, GROUP_ORDER, MODEL_FIELDS, fieldDef } from '@/lib/fields/registry';
import { byBranch, unplaced, type VocabularyTerm } from '@/lib/vocabulary/thesaurus';
import { COMMUNITY_LABELS, type Community, type KeywordCandidate } from '@/lib/types';

/**
 * The controlled vocabulary, as a thesaurus hung on the logical tree.
 *
 * Three things a cataloguer does here, in the order the screen puts them:
 *
 *   **Place what is homeless.** A term with no branch is a term nobody can
 *   reason about. Four of the first twenty-nine had none, so this section is
 *   first and disappears when it is empty.
 *
 *   **Merge what has split.** `Bombay` and `Mumbai` were two terms for one
 *   city, and a search for either missed the other. Merging keeps both
 *   spellings, moves the records, and settles which one the archive writes.
 *   It is a volunteer's to do: an operation people must ask permission for is
 *   an operation that does not happen, and it destroys nothing.
 *
 *   **Judge what the model proposed.** A proposal now arrives naming the
 *   branch it subdivides, so accepting one is adding a subdivision to a
 *   catalogue rather than dropping a word into a bag.
 */
export function VocabularyManager({
  terms,
  candidates,
  isAdmin,
}: {
  terms: VocabularyTerm[];
  candidates: KeywordCandidate[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [term, setTerm] = useState('');
  const [scope, setScope] = useState<Community | ''>('');
  const [branch, setBranch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [merging, setMerging] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const branches = useMemo(() => byBranch(terms), [terms]);
  const homeless = useMemo(() => unplaced(terms), [terms]);

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
    if (!term.trim() || !branch) return;
    setBusyId('new');
    const done = await send('/api/manage/keywords', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ term: term.trim(), community: scope || null, branchKey: branch }),
    });
    if (done) setTerm('');
    setBusyId(null);
  }

  async function amend(body: Record<string, unknown>, id: string) {
    setBusyId(id);
    await send('/api/manage/keywords', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusyId(null);
    setMerging(null);
  }

  async function remove(id: string) {
    setBusyId(id);
    await send(`/api/manage/keywords?id=${id}`, { method: 'DELETE' });
    setBusyId(null);
    setRemoving(null);
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
        <form onSubmit={add} className="mb-6 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label>
            <span className="eyebrow mb-1.5 block">New term</span>
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              maxLength={60}
              placeholder="Alibag"
              className="h-13 w-full rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:bg-accent-wash/30 focus:outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={busyId === 'new' || !term.trim() || !branch}
            className={buttonClass('primary', 'h-13')}
          >
            {busyId === 'new' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Add
          </button>

          <label className="sm:col-span-2">
            {/* Required, not optional. A term that subdivides nothing is the
                thing this screen was rebuilt to stop producing. */}
            <span className="eyebrow mb-1.5 block">Subdivides</span>
            <BranchSelect value={branch} onChange={setBranch} placeholder="Choose a branch" />
          </label>

          <label className="sm:col-span-2">
            <span className="eyebrow mb-1.5 block">Offered for</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as Community | '')}
              className="h-13 w-full rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:outline-none"
            >
              <option value="">Every community</option>
              {COMMUNITY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {COMMUNITY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
        </form>

        {error && (
          <p
            role="alert"
            className="mb-5 rounded-lg border-l-[3px] border-critical bg-critical/8 px-3 py-2 text-sm text-critical"
          >
            {error}
          </p>
        )}

        {homeless.length > 0 && (
          <div className="mb-8 rounded-xl border-l-[3px] border-caution bg-accent-wash px-4 py-4">
            <h2 className="font-display text-lg">
              {homeless.length === 1 ? 'One term has no home' : `${homeless.length} terms have no home`}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-caution">
              These predate the tree. Until a term says which branch it subdivides, nothing can
              reason about it — and the model is never offered it as a proposal target.
            </p>
            <ul className="mt-4 space-y-2.5">
              {homeless.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-[8rem] font-medium">{row.term}</span>
                  <BranchSelect
                    value=""
                    placeholder="Place it under…"
                    disabled={busyId === row.id}
                    onChange={(branchKey) =>
                      branchKey && amend({ action: 'place', id: row.id, branchKey }, row.id)
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {branches.length === 0 && homeless.length === 0 ? (
          <p className="rounded-xl border border-dashed border-rule-strong bg-paper-2/60 px-6 py-10 text-center text-muted">
            The vocabulary is empty. Until it has terms, records can carry no keywords at all.
          </p>
        ) : (
          <div className="space-y-8">
            {branches.map((group) => (
              <div key={group.branchKey}>
                <h3 className="eyebrow mb-1 flex flex-wrap items-baseline gap-2">
                  {group.label}
                  <span className="font-mono normal-case">{group.terms.length}</span>
                </h3>
                <p className="mb-3 text-sm text-muted">{group.catalogue}</p>

                <ul className="space-y-2">
                  {group.terms.map((row) => (
                    <li key={row.id} className="rounded-lg border border-rule bg-paper-2 px-3.5 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{row.term}</span>

                        {row.community && (
                          <span
                            className="inline-flex items-center gap-1.5 text-sm text-muted"
                            title={`Only offered on ${COMMUNITY_LABELS[row.community]} records`}
                          >
                            <span
                              aria-hidden
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: COMMUNITY_COLORS[row.community] }}
                            />
                            {COMMUNITY_LABELS[row.community]}
                          </span>
                        )}

                        {/* The variants. Shown plainly rather than hidden,
                            because "we already have a word for that" is the
                            single most useful thing this screen can tell
                            somebody about to add a duplicate. */}
                        {row.variants.length > 0 && (
                          <span className="text-sm text-muted">
                            also: {row.variants.join(', ')}
                          </span>
                        )}

                        <span className="flex-1" />

                        <button
                          type="button"
                          onClick={() => {
                            setMerging(merging === row.id ? null : row.id);
                            setRemoving(null);
                          }}
                          disabled={busyId === row.id}
                          title="Make this a spelling of another term"
                          className="rounded p-1.5 text-muted transition-colors hover:bg-accent-wash hover:text-ink disabled:opacity-40"
                        >
                          <Merge size={15} />
                          <span className="sr-only">Merge {row.term} into another term</span>
                        </button>

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setRemoving(removing === row.id ? null : row.id);
                              setMerging(null);
                            }}
                            disabled={busyId === row.id}
                            className="rounded p-1.5 text-muted transition-colors hover:bg-critical/10 hover:text-critical disabled:opacity-40"
                          >
                            <Trash2 size={14} />
                            <span className="sr-only">Remove {row.term}</span>
                          </button>
                        )}
                      </div>

                      {/*
                          Removing a term is the one action on this screen that
                          reaches back into records already catalogued, and it
                          did it on a single click. The word stays on every
                          record that carries it and stops being choosable — so
                          the next reviewer to save one of those records loses
                          it silently, because the save resolves against the
                          vocabulary. Merging is almost always what was meant.
                      */}
                      {removing === row.id && (
                        <div className="mt-3 rounded-lg border-l-[3px] border-critical bg-critical/6 px-4 py-3">
                          <p className="text-sm leading-relaxed">
                            Remove <strong>{row.term}</strong> from the vocabulary? Records already
                            catalogued with it keep the word, but it can no longer be chosen — and
                            the next review saved on one of those records will drop it.
                            {row.variants.length > 0 ? (
                              <>
                                {' '}Its {row.variants.length === 1 ? 'variant' : 'variants'}{' '}
                                <strong>{row.variants.join(', ')}</strong> go with it. A term that
                                already holds variants cannot be merged into another — split them
                                off first if you want to keep them.
                              </>
                            ) : (
                              <> If it is a duplicate, merge it instead.</>
                            )}
                          </p>
                          <div className="mt-2.5 flex gap-2">
                            <button
                              type="button"
                              onClick={() => remove(row.id)}
                              disabled={busyId === row.id}
                              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-critical px-4 text-sm font-medium text-paper transition-all duration-200 hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-40"
                            >
                              {busyId === row.id && <Loader2 size={14} className="animate-spin" />}
                              Remove it
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemoving(null)}
                              className="h-10 rounded-full px-3 text-sm text-muted hover:text-ink"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {merging === row.id && (
                        <div className="mt-3 border-t border-rule pt-3">
                          <p className="mb-2 text-sm leading-relaxed text-muted">
                            Make <strong>{row.term}</strong> another spelling of a term in this
                            branch. Both spellings keep working; records move to the one you choose.
                          </p>
                          <select
                            defaultValue=""
                            disabled={busyId === row.id}
                            onChange={(e) =>
                              e.target.value &&
                              amend({ action: 'merge', id: row.id, intoId: e.target.value }, row.id)
                            }
                            className="h-11 w-full rounded-lg border border-rule-strong bg-paper px-3 focus:border-accent-strong focus:outline-none"
                          >
                            <option value="">Which term is it a spelling of?</option>
                            {group.terms
                              .filter((other) => other.id !== row.id && other.variants.length === 0)
                              .map((other) => (
                                <option key={other.id} value={other.id}>
                                  {other.term}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl">Suggested by the model</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Words the analysis needed that the vocabulary does not hold, each naming the branch it
          would subdivide. The count is how many times it has come up.
        </p>

        {candidates.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-rule-strong bg-paper-2/60 px-5 py-8 text-center text-sm text-muted">
            Nothing waiting.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-rule border-y border-rule">
            {candidates.map((candidate) => {
              const def = candidate.branch_key ? fieldDef(candidate.branch_key) : null;
              return (
                <li key={candidate.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{candidate.term}</span>
                    <span className="block truncate text-sm text-muted">
                      {def ? def.label : 'No branch — from before the tree'}
                      {candidate.community && ` · ${COMMUNITY_LABELS[candidate.community]}`}
                    </span>
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
              );
            })}
          </ul>
        )}
      </section>

      {pending && <span className="sr-only">Saving</span>}
    </div>
  );
}

/**
 * Every branch of the tree, under the catalogue it belongs to.
 *
 * `MODEL_FIELDS` rather than every field: the six that are columns on `items`
 * — community, category, period — are not subdivided by subject words, and the
 * five the file itself answers are not either.
 */
function BranchSelect({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const groups = GROUP_ORDER.map((group) => ({
    group,
    label: FIELD_GROUPS[group].label,
    catalogue: FIELD_GROUPS[group].blurb,
    fields: MODEL_FIELDS.filter((f) => f.group === group && f.type !== 'enum'),
  })).filter((g) => g.fields.length > 0);

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-13 w-full rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:outline-none disabled:opacity-50"
    >
      <option value="">{placeholder}</option>
      {groups.map((group) => (
        <optgroup key={group.group} label={`${group.catalogue} · ${group.label}`}>
          {group.fields.map((field) => (
            <option key={field.key} value={field.key}>
              {field.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
