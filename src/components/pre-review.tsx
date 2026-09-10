'use client';

import { useMemo, useState } from 'react';
import { Eye, Languages, Loader2, Plus, X } from 'lucide-react';
import { useMessages } from '@/lib/i18n/provider';
import { FieldSheet } from '@/components/field-sheet';
import type { PickableLanguage } from '@/components/language-picker';
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
  /**
   * The path this reading came from and the proof it is the caller's.
   *
   * Carried here only so the language switch under the scanned text can spend
   * it: at pre-review there is no record and no session, so the grant minted at
   * /api/uploads/sign is the only claim a contributor has to make.
   */
  path: string;
  grant: string;
  expiresAt: number;
  /**
   * Every language of this reading, made in one call as the screen opened.
   *
   * Null until it lands, and null forever for a passage too long to render
   * five times over. The switch reads it first and falls through to a single
   * call when a language is not here, so a missing head start costs a wait and
   * never a feature.
   */
  translations: Record<string, Record<string, string>> | null;
}

export interface OfferedTerm {
  term: string;
  variants: string[];
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
  vocabulary,
  languages,
  readingLanguage,
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
  /** The archive's own tag list. Contributors may pick from it, not add to it. */
  vocabulary: OfferedTerm[];
  /**
   * The languages the archive publishes in, for the switch under the scanned
   * text. Read from `archive_languages` on the server and handed down, so
   * adding Judeo-Arabic stays a row rather than a deploy.
   */
  languages: PickableLanguage[];
  /**
   * The language the machine wrote this reading in.
   *
   * The switch does not offer it: that is what the "Original" chip is, and a
   * chip that re-renders Marathi into Marathi spends a model call to produce
   * the text already on the screen.
   */
  readingLanguage: string | null;
}) {
  const t = useMessages();
  const submitButton = (
    <>
    {blocked && (
      <p className="mb-3 rounded-lg border-s-[3px] border-caution bg-accent-wash px-3 py-2 text-sm text-caution">
        {t('prereview.tickTheBox')}
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
          <p className="mt-1 text-sm text-muted">{t('prereview.subtitle')}</p>
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
        {simulated && <SimulatedNotice label={t('common.simulated')} />}

        {entries.map((entry, index) => (
          <EntryPanel
              vocabulary={vocabulary}
            key={entry.id}
            entry={entry}
            index={index}
            total={entries.length}
            draft={drafts[entry.id] ?? EMPTY_DRAFT}
            onChange={(draft) => onDraftChange(entry.id, draft)}
            showTitle={perItemTitles}
            showFields={perItemTitles}
            languages={languages.filter((l) => l.code !== readingLanguage)}
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
  vocabulary,
  languages,
}: {
  entry: PreReviewEntry;
  index: number;
  total: number;
  draft: Draft;
  onChange: (draft: Draft) => void;
  showTitle: boolean;
  /** Only when each file is its own record. Otherwise the sheet sits above. */
  showFields: boolean;
  vocabulary: OfferedTerm[];
  languages: PickableLanguage[];
}) {
  const t = useMessages();
  const { analysis } = entry;


  return (
    <article className={total > 1 ? 'border-l-2 border-rule pl-5' : undefined}>
      {total > 1 && (
        <p className="eyebrow mb-3">
          {t('prereview.fileOf', { n: index + 1, total })} · {entry.fileName}
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
              <Suggested
                value={analysis.summary}
                current={draft.description}
                onUse={(v) => onChange({ ...draft, description: v })}
              />
              <span className="mt-1.5 block text-sm text-muted">
                {t('prereview.prefilled')}
              </span>
            </label>
          )}

          {(
            <div className="mb-5">
              <p className="eyebrow mb-1.5">{t('prereview.yourTags')}</p>
              <TagPicker
                chosen={draft.keywords}
                offered={vocabulary}
                suggested={analysis.keywords}
                onChange={(keywords) => onChange({ ...draft, keywords })}
              />
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
            one they have to argue about with a knowledge expert later — so they moved
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

          {/*
            The evidence ledger used to be here, collecting every basis into one
            block at the bottom under "What each answer rests on". It is gone,
            and nothing was lost: `FieldSheet` already prints the basis beneath
            the field it belongs to, which is where somebody checking that field
            is actually looking. A second copy at the end of the page was one
            more thing to scroll past and one more place to disagree with.
          */}

          <Reading entry={entry} analysis={analysis} languages={languages} />
        </>
      )}
    </article>
  );
}

/**
 * What the AI proposed for this field, under the field.
 *
 * It used to sit in one block at the top ("The machine's reading") and again
 * in one at the bottom ("What each answer rests on"), which meant a person
 * correcting the description had the thing they were correcting two scrolls
 * away in either direction. Suggestions belong under the box they are a
 * suggestion for.
 *
 * Hidden once the value matches, because at that point it is not a suggestion
 * any more, it is the answer — and a line saying "the AI suggested" above
 * identical text reads as a disagreement that is not there.
 */
function Suggested({
  value,
  current,
  onUse,
}: {
  value: string | null;
  current: string;
  onUse: (value: string) => void;
}) {
  const t = useMessages();
  if (!value?.trim() || value.trim() === current.trim()) return null;

  return (
    <span className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg bg-paper-2/70 px-3 py-2 text-sm">
      <span className="eyebrow shrink-0 text-[0.7rem]">{t('prereview.aiSuggested')}</span>
      <span className="machine flex-1 leading-relaxed text-ink-2">{value}</span>
      <button
        type="button"
        onClick={() => onUse(value)}
        className="shrink-0 text-accent underline underline-offset-2 hover:text-accent-strong"
      >
        {t('prereview.useThis')}
      </button>
    </span>
  );
}

/**
 * Tags, from the archive's own list and nowhere else.
 *
 * A contributor used to type whatever they liked here. That is generous and it
 * is how a catalogue stops being one: "Bombay", "bombay", "Mumbai" and "Bombay
 * (Mumbai)" become four different things nobody can search across, and the
 * knowledge manager spends their time merging spellings instead of reading
 * material.
 *
 * So this offers what already exists — the same list the review workbench binds
 * to, managed at /manage/vocabulary — and nothing else. The list is public to
 * read, so an anonymous contributor sees every term a volunteer would.
 *
 * **What is not here is not lost.** A term the archive has never used is a real
 * thing somebody knows and the vocabulary does not, so the note points at the
 * description: written there, it reaches a person who can add the term properly
 * rather than being filed under a spelling only this record will ever use.
 *
 * Variants are matched but never stored. Somebody typing "Bombay" finds the
 * term whose preferred spelling the archive settled on, and the record carries
 * the preferred one — which is the whole point of a thesaurus.
 */
function TagPicker({
  chosen,
  offered,
  suggested,
  onChange,
}: {
  chosen: string[];
  offered: { term: string; variants: string[] }[];
  suggested: string[];
  onChange: (keywords: string[]) => void;
}) {
  const t = useMessages();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const add = (term: string) => {
    if (!chosen.includes(term)) onChange([...chosen, term]);
    setQuery('');
  };

  /*
   * Only terms the archive actually holds, and only ones not already chosen.
   * Matched on the preferred spelling *and* on every variant, so the person who
   * knows it as Bombay finds it without knowing what the archive calls it.
   */
  const needle = query.trim().toLowerCase();
  const matches = offered
    .filter((term) => !chosen.includes(term.term))
    .filter(
      (term) =>
        !needle ||
        term.term.toLowerCase().includes(needle) ||
        term.variants.some((v) => v.toLowerCase().includes(needle)),
    )
    .slice(0, 40);

  // A model suggestion is only offered if it is a term that exists. One that is
  // not in the list is not a tag, whatever the model thought.
  const known = new Set(offered.map((term) => term.term));
  const suggestions = suggested.filter((term) => known.has(term) && !chosen.includes(term));

  return (
    <div>
      <ul className="flex flex-wrap items-center gap-2">
        {chosen.map((term) => (
          <li
            key={term}
            className="flex items-center gap-1 rounded-full border border-rule bg-paper py-1.5 pe-1.5 ps-3.5 text-sm"
          >
            {term}
            <button
              type="button"
              onClick={() => onChange(chosen.filter((k) => k !== term))}
              className="rounded-full p-1 text-muted transition-colors hover:bg-critical/10 hover:text-critical"
            >
              <X size={13} />
              <span className="sr-only">{t('prereview.removeTag', { term })}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="relative mt-2">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder={t('prereview.addTag')}
          maxLength={60}
          className="h-11 w-full rounded-lg border border-rule bg-paper px-3.5 text-sm focus:border-accent-strong focus:outline-none"
        />

        {open && (
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-rule bg-paper shadow-lift">
            {matches.length === 0 ? (
              <p className="px-3.5 py-3 text-sm text-muted">{t('prereview.tagsNoMatch')}</p>
            ) : (
              <ul>
                {matches.map((term) => (
                  <li key={term.term}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => add(term.term)}
                      className="flex w-full items-baseline gap-2 px-3.5 py-2 text-start text-sm transition-colors hover:bg-paper-2"
                    >
                      <span>{term.term}</span>
                      {needle &&
                        !term.term.toLowerCase().includes(needle) &&
                        term.variants.some((v) => v.toLowerCase().includes(needle)) && (
                          <span className="text-xs text-muted">
                            {term.variants.find((v) => v.toLowerCase().includes(needle))}
                          </span>
                        )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="mt-2.5">
          <p className="eyebrow mb-1.5 text-[0.7rem]">{t('prereview.tagsSuggested')}</p>
          <ul className="flex flex-wrap gap-2">
            {suggestions.map((term) => (
              <li key={term}>
                <button
                  type="button"
                  onClick={() => add(term)}
                  className="flex items-center gap-1 rounded-full border border-dashed border-rule-strong px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent-strong hover:bg-accent-wash hover:text-ink"
                >
                  <Plus size={13} />
                  {term}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-2 text-sm leading-relaxed text-muted">{t('prereview.tagsFromList')}</p>
    </div>
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

/**
 * What was read off the document, and the switch that renders it in a language
 * the contributor actually reads.
 *
 * ── the question this answers ───────────────────────────────────────────────
 *
 * Pre-review asks one thing: did the machine read your document correctly? A
 * family bringing a Marathi ketubah or a Malayalam letter was being asked that
 * about a transcription they could not read, which is not a question, it is a
 * form. The switch is what turns it back into one.
 *
 * ── three decisions worth keeping ───────────────────────────────────────────
 *
 * **The original is a chip, not a back button.** It is first in the row and it
 * is where the panel starts. A translation is a lens over the reading, never a
 * replacement for it, and the thing that gets submitted is always the original
 * — which the note under the row says outright.
 *
 * **A language is fetched when it is asked for, and once.** Translating into
 * five languages the moment a file is read would spend five times the day's
 * allowance to answer a question nobody asked; the archive runs on twenty model
 * calls a day per model. Clicking Hebrew costs one call, clicking back to the
 * original costs nothing, and clicking Hebrew again costs nothing.
 *
 * **The text and the transcript move together.** They are two halves of one
 * document — a recording's transcript and the text on its label — and one call
 * carries both, so a page that has both does not cost two.
 */
function Reading({
  entry,
  analysis,
  languages,
}: {
  entry: PreReviewEntry;
  analysis: AnalysisResult;
  languages: PickableLanguage[];
}) {
  const t = useMessages();
  const [lang, setLang] = useState<string | null>(null);
  const [fetched, setFetched] = useState<Record<string, Record<string, string>>>({});

  /*
   * What is known, worked out during render rather than copied into state.
   *
   * The batch arrives after this component has mounted, so holding it in state
   * would mean an effect that writes state on every render where the two agree.
   * The prefetch is a prop and the on-demand calls are state; the switch reads
   * the union, and a language present in both is the same translation twice.
   */
  const made = useMemo(
    () => ({ ...(entry.translations ?? {}), ...fetched }),
    [entry.translations, fetched],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const blocks = useMemo(() => {
    const found: { key: 'ocrText' | 'transcript'; label: string; text: string }[] = [];
    if (analysis.ocrText) found.push({ key: 'ocrText', label: t('prereview.textFound'), text: analysis.ocrText });
    if (analysis.transcript) found.push({ key: 'transcript', label: t('prereview.transcript'), text: analysis.transcript });
    return found;
  }, [analysis.ocrText, analysis.transcript, t]);

  if (!blocks.length) return null;

  const showing = lang ? made[lang] : null;
  const chosen = languages.find((l) => l.code === lang) ?? null;

  async function choose(code: string | null) {
    setFailed(null);
    if (code === null || made[code]) return setLang(code);

    setBusy(code);
    try {
      const response = await fetch('/api/analyze/translate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: entry.path,
          grant: entry.grant,
          expiresAt: entry.expiresAt,
          lang: code,
          sourceLanguage: analysis.language,
          blocks: blocks.map((block) => ({ key: block.key, text: block.text })),
        }),
      });
      const body = await response.json();

      /*
       * The status is not the answer; the envelope is.
       *
       * Every route in this app answers `{ ok, data | error }`, and a 200 with
       * `ok: false` is a failure however encouraging the status line looks.
       * Checking both is what stops a failed switch from clearing the text and
       * showing nothing.
       */
      if (!response.ok || !body?.ok) {
        setFailed(body?.error?.message ?? t('reading.failed'));
        return;
      }

      setFetched((held) => ({ ...held, [code]: body.data.values as Record<string, string> }));
      setLang(code);
    } catch {
      setFailed(t('reading.failed'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-5">
      {blocks.map((block) => (
        <Excerpt
          key={block.key}
          label={block.label}
          text={showing?.[block.key] ?? block.text}
          rtl={showing?.[block.key] ? chosen?.rtl : undefined}
        />
      ))}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="flex items-center gap-1.5 text-muted">
          <Languages size={15} aria-hidden />
          <span className="eyebrow text-[0.7rem]">{t('reading.readIn')}</span>
        </span>

        <Chip label={t('reading.original')} active={lang === null} onClick={() => choose(null)} />
        {languages.map((language) => (
          <Chip
            key={language.code}
            label={language.label_native}
            rtl={language.rtl}
            active={lang === language.code}
            pending={busy === language.code}
            disabled={busy !== null}
            onClick={() => choose(language.code)}
          />
        ))}
      </div>

      {/* Said where it is read, not once at the top of the panel: somebody
          looking at Marathi they cannot check needs to know, right there,
          that a machine wrote it and that the original is one click away. */}
      {lang !== null && !failed && (
        <p className="mt-2 text-sm leading-relaxed text-muted">{t('reading.machine')}</p>
      )}
      {failed && (
        <p
          role="status"
          className="mt-2 rounded-lg border-s-[3px] border-caution bg-accent-wash px-3 py-2 text-sm text-caution"
        >
          {failed}
        </p>
      )}
    </div>
  );
}

function Chip({
  label,
  active,
  pending,
  disabled,
  rtl,
  onClick,
}: {
  label: string;
  active: boolean;
  pending?: boolean;
  disabled?: boolean;
  rtl?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled && !active}
      onClick={onClick}
      dir={rtl ? 'rtl' : undefined}
      className={
        active
          ? // 44px on a phone, which is the tap target, and tighter once there
          // is a mouse. The switch is a thing people use at a table with a
          // document in one hand.
            'flex h-11 items-center gap-1.5 rounded-full border border-accent-strong bg-accent-strong px-3.5 text-sm text-paper sm:h-9'
          : 'flex h-11 items-center gap-1.5 rounded-full border border-rule bg-paper px-3.5 text-sm text-ink-2 transition-colors hover:border-accent hover:text-ink disabled:opacity-50 sm:h-9'
      }
    >
      {pending && <Loader2 size={13} className="animate-spin" aria-hidden />}
      {label}
    </button>
  );
}

function Excerpt({ label, text, rtl }: { label: string; text: string; rtl?: boolean }) {
  return (
    <div className="mt-5 first:mt-0">
      <p className="eyebrow mb-1.5">{label}</p>
      <p
        /* `auto` reads the first strong character, which is right for a
           document quoted back. A translation knows its own direction, so it
           says so — a Hebrew rendering of an English page opens with a Latin
           name often enough that guessing gets it wrong. */
        dir={rtl === undefined ? 'auto' : rtl ? 'rtl' : 'ltr'}
        className="transcription max-h-56 overflow-auto border border-rule bg-paper p-3"
      >
        {text}
      </p>
    </div>
  );
}
