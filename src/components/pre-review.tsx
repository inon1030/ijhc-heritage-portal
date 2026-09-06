'use client';

import { useState } from 'react';
import { Eye, Loader2, Plus, X } from 'lucide-react';
import { EvidenceLedger } from '@/components/evidence-ledger';
import { useMessages } from '@/lib/i18n/provider';
import { FieldSheet } from '@/components/field-sheet';
import { SimulatedNotice } from '@/components/primitives';
import type { AnalysisResult } from '@/lib/ai/types';
import type { FieldValue } from '@/lib/fields/registry';
import { formatBytes } from '@/lib/utils';

/**
 * What the archive found, before anything is submitted.
 *
 * The contributor may rewrite the description and the tags. What they write is
 * *theirs* — it lands in `items.contributor_description` and
 * `items.contributor_keywords`, beside the machine's version rather than on top
 * of it, and a volunteer decides what becomes the record. Accepting the
 * machine's text unchanged does not publish machine text.
 *
 * The panel can be closed. It is a working surface, not a wall between the
 * contributor and the submit button, and someone who has read it once should
 * not have to scroll past it again.
 *
 * There is no confidence percentage here. See ADR-012: the number is a model's
 * opinion of itself, it clustered on 0.95, and a reviewer can do nothing with
 * it. What each suggestion rests on is shown instead — and since the tree
 * arrived, the number decides only whether a field appears at all (70%, in
 * suggestions.ts). It is never shown, because it is not what anyone checks.
 */

export interface Draft {
  title: string;
  description: string;
  keywords: string[];
  /**
   * The catalogue fields, held per record rather than per file. A record is
   * what gets catalogued; five pages of one prayer book have one place of
   * origin between them, not five.
   */
  fields: FieldValue[];
}

export interface PreReviewEntry {
  id: string;
  fileName: string;
  previewUrl: string | null;
  analysis: AnalysisResult | null;
  analysisError: string | null;
  metadata: { mimeType: string; byteSize: number; width?: number; height?: number };
  durationMs: number | null;
}

export function PreReview({
  entries,
  drafts,
  onDraftChange,
  perItemTitles,
  simulated,
  hidden,
  onHiddenChange,
  onSubmit,
  submitting,
  blocked,
}: {
  entries: PreReviewEntry[];
  drafts: Record<string, Draft>;
  onDraftChange: (id: string, draft: Draft) => void;
  /** True when each file becomes its own record and so needs its own title. */
  perItemTitles: boolean;
  simulated: boolean;
  hidden: boolean;
  onHiddenChange: (hidden: boolean) => void;
  onSubmit: () => void;
  submitting: boolean;
  /** The terms have not been agreed to yet. */
  blocked: boolean;
}) {
  const t = useMessages();
  const submitButton = (
    <>
    {blocked && (
      <p className="mb-3 rounded-lg border-s-[3px] border-caution bg-accent-wash px-3 py-2 text-sm text-caution">
        Tick the box under &ldquo;Tell us what you know&rdquo; to confirm you may share this
        material.
      </p>
    )}
    <button
      onClick={onSubmit}
      disabled={submitting || blocked}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent-strong font-medium text-paper shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent hover:shadow-lift disabled:pointer-events-none disabled:opacity-60"
    >
      {submitting ? (
        <>
          <Loader2 size={17} className="animate-spin" /> {t('prereview.submitting')}
        </>
      ) : entries.length > 1 && perItemTitles ? (
        t('prereview.submitMany', { count: entries.length })
      ) : (
        t('prereview.submit')
      )}
    </button>
    </>
  );

  if (hidden) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => onHiddenChange(false)}
          className="flex h-12 items-center gap-2 rounded-full border border-rule bg-paper px-5 font-medium shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-strong"
        >
          <Eye size={17} />
          {t('prereview.show')}
        </button>
        {submitButton}
      </div>
    );
  }

  return (
    <section className="card bg-paper-2/60">
      <header className="flex items-start gap-4 border-b border-rule px-6 py-5">
        <div className="flex-1">
          <h2 className="font-display text-xl sm:text-2xl">{t('prereview.heading')}</h2>
          <p className="mt-1 text-sm text-muted">
            Suggestions, not a record. Correct anything you know better — a volunteer reads both
            versions before publishing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onHiddenChange(true)}
          className="rounded-md p-2 text-muted transition-colors hover:bg-paper-3 hover:text-ink"
        >
          <X size={20} />
          <span className="sr-only">{t('prereview.hide')}</span>
        </button>
      </header>

      <div className="space-y-8 px-6 py-6">
        {simulated && <SimulatedNotice />}

        {entries.map((entry, index) => (
          <EntryPanel
            key={entry.id}
            entry={entry}
            index={index}
            total={entries.length}
            draft={drafts[entry.id] ?? EMPTY_DRAFT}
            onChange={(draft) => onDraftChange(entry.id, draft)}
            showTitle={perItemTitles}
            showFields={perItemTitles}
          />
        ))}

        {/* One record from several files gets one sheet, seeded from all of
            them. Per-file sheets would ask the same question of every page. */}
        {!perItemTitles && entries[0] && (
          <FieldSheet
            tone="contributor"
            includeBasics
            values={(drafts[entries[0].id] ?? EMPTY_DRAFT).fields}
            onChange={(fields) =>
              onDraftChange(entries[0].id, { ...(drafts[entries[0].id] ?? EMPTY_DRAFT), fields })
            }
            disabled={submitting}
          />
        )}

        {submitButton}
      </div>
    </section>
  );
}

const EMPTY_DRAFT: Draft = { title: '', description: '', keywords: [], fields: [] };

function EntryPanel({
  entry,
  index,
  total,
  draft,
  onChange,
  showTitle,
  showFields,
}: {
  entry: PreReviewEntry;
  index: number;
  total: number;
  draft: Draft;
  onChange: (draft: Draft) => void;
  showTitle: boolean;
  /** Only when each file is its own record. Otherwise the sheet sits above. */
  showFields: boolean;
}) {
  const t = useMessages();
  const [newKeyword, setNewKeyword] = useState('');
  const { analysis } = entry;

  function addKeyword() {
    const term = newKeyword.trim();
    if (!term || draft.keywords.includes(term)) return;
    onChange({ ...draft, keywords: [...draft.keywords, term] });
    setNewKeyword('');
  }

  return (
    <article className={total > 1 ? 'border-l-2 border-rule pl-5' : undefined}>
      {total > 1 && (
        <p className="eyebrow mb-3">
          File {index + 1} of {total} · {entry.fileName}
        </p>
      )}

      {entry.analysisError && (
        <p className="mb-4 rounded-lg border-s-[3px] border-caution bg-accent-wash px-3 py-2 text-sm text-caution">
          {entry.analysisError}
        </p>
      )}

      {showTitle && (
        <label className="mb-5 block">
          <span className="eyebrow mb-1.5 block">{t('prereview.titleForItem')}</span>
          <input
            value={draft.title}
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
            maxLength={200}
            className="h-13 w-full rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:bg-accent-wash/30 focus:outline-none"
          />
        </label>
      )}

      {/*
        The file itself, beside what was read from it.
        
        It was not shown here at all until a TIFF made the absence obvious: a
        contributor checking whether the archive understood their scan had
        nothing to check it against.
      */}
      {entry.previewUrl && (
        <div className="mb-5 overflow-hidden rounded-lg border border-rule bg-paper-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={entry.previewUrl}
            alt={entry.fileName}
            className="max-h-72 w-full object-contain"
          />
        </div>
      )}

      {analysis && (
        <>
          <div className="mb-5">
            <p className="eyebrow mb-1.5">{t('prereview.machineReading')}</p>
            <p className="machine border-s-2 border-rule ps-3 text-ink-2">{analysis.summary}</p>
          </div>

          {(
            <label className="mb-5 block">
              <span className="eyebrow mb-1.5 block">{t('prereview.yourDescription')}</span>
              <textarea
                value={draft.description}
                onChange={(e) => onChange({ ...draft, description: e.target.value })}
                rows={4}
                maxLength={4000}
                className="w-full resize-y rounded-lg border border-rule bg-paper px-4 py-3 leading-relaxed focus:border-accent-strong focus:outline-none"
              />
              <span className="mt-1.5 block text-sm text-muted">
                {t('prereview.prefilled')}
              </span>
            </label>
          )}

          {(
            <div className="mb-5">
              <p className="eyebrow mb-1.5">{t('prereview.yourTags')}</p>
              <ul className="flex flex-wrap items-center gap-2">
                {draft.keywords.map((term) => (
                  <li
                    key={term}
                    className="flex items-center gap-1 rounded-full border border-rule bg-paper py-1.5 pe-1.5 ps-3.5 text-sm"
                  >
                    {term}
                    <button
                      type="button"
                      onClick={() =>
                        onChange({ ...draft, keywords: draft.keywords.filter((k) => k !== term) })
                      }
                      className="rounded-full p-1 text-muted transition-colors hover:bg-critical/10 hover:text-critical"
                    >
                      <X size={13} />
                      <span className="sr-only">Remove {term}</span>
                    </button>
                  </li>
                ))}
                <li className="flex items-center gap-1">
                  <input
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addKeyword();
                      }
                    }}
                    maxLength={60}
                    placeholder={t('prereview.addTag')}
                    className="h-11 w-40 rounded-lg border border-rule bg-paper px-3.5 text-sm focus:border-accent-strong focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={addKeyword}
                    disabled={!newKeyword.trim()}
                    className="rounded p-2 text-muted transition-colors hover:bg-paper-3 hover:text-ink disabled:opacity-40"
                  >
                    <Plus size={16} />
                    <span className="sr-only">{t('prereview.addTagAction')}</span>
                  </button>
                </li>
              </ul>
              <p className="mt-1.5 text-sm text-muted">
                {t('prereview.vocabularyNote')}
              </p>
            </div>
          )}

          {showFields && (
            <div className="mb-6">
              <FieldSheet
                tone="contributor"
                includeBasics
                values={draft.fields}
                onChange={(fields) => onChange({ ...draft, fields })}
              />
            </div>
          )}

          {/*
            Only what was measured from the file itself.

            Community, period, place and language used to sit here as read-only
            text. They are findings, and a finding a person cannot correct is
            one they have to argue about with a volunteer later — so they moved
            into the sheet above, where they can be edited. What is left is the
            bytes: nothing here was generated, and nothing here is arguable.
          */}
          <dl className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Fact label={t('prereview.size')}>{formatBytes(entry.metadata.byteSize)}</Fact>
            <Fact label={t('prereview.dimensions')}>
              {entry.metadata.width && entry.metadata.height
                ? `${entry.metadata.width} × ${entry.metadata.height}`
                : 'not measured'}
            </Fact>
            <Fact label={t('prereview.type')}>{entry.metadata.mimeType}</Fact>
            {entry.durationMs !== null && (
              <Fact label={t('prereview.duration')}>{Math.round(entry.durationMs / 1000)}s</Fact>
            )}
          </dl>

          <EvidenceLedger evidence={analysis.evidence} reasoning={analysis.reasoning} />

          {analysis.ocrText && (
            <Excerpt label={t('prereview.textFound')} text={analysis.ocrText} />
          )}
          {analysis.transcript && <Excerpt label={t('prereview.transcript')} text={analysis.transcript} />}
        </>
      )}
    </article>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow mb-1">{label}</dt>
      <dd className="machine">{children}</dd>
    </div>
  );
}

function Excerpt({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-5">
      <p className="eyebrow mb-1.5">{label}</p>
      <p
        dir="auto"
        className="transcription max-h-56 overflow-auto border border-rule bg-paper p-3"
      >
        {text}
      </p>
    </div>
  );
}
