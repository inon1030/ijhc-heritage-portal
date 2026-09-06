'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { ConsentBlock } from '@/components/consent-block';
import { RingMark, buttonClass } from '@/components/primitives';
import { Reveal } from '@/components/reveal';
import { FilePicker, type PickedFile } from '@/components/file-picker';
import { LinkInput, type CapturedLink } from '@/components/link-input';
import { PreReview, type Draft } from '@/components/pre-review';
import { CONSENT_VERSION } from '@/lib/consent';
import { useMessages } from '@/lib/i18n/provider';
import { mergeSuggestions } from '@/lib/fields/suggestions';
import { measureDuration } from '@/lib/files/measure';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import type { AnalysisResult } from '@/lib/ai/types';
import { cn } from '@/lib/utils';

/**
 * Contribution, in the order a person actually does it.
 *
 * Files go straight from the browser to storage using one-shot signed tokens,
 * so a batch of 50 MB scans is not constrained by the platform's request body
 * limit, and each file is read on its own.
 *
 * Two things here are deliberate and easy to get wrong:
 *
 * Whether several files are one record or several is asked, not guessed. Five
 * pages of a prayer book and five photographs from a shoebox look identical
 * from the bytes, and being wrong costs a volunteer a merge or a split by hand.
 *
 * What the contributor writes in the pre-review is *theirs*, and lands in its
 * own columns. Accepting the machine's description unchanged does not turn it
 * into the record — a volunteer still moves it across. That is the whole point
 * of the archive.
 */

interface FileMetadata {
  mimeType: string;
  byteSize: number;
  width?: number;
  height?: number;
}

/**
 * One stored file, read.
 *
 * Deliberately not holding the `PickedFile` it came from: a captured web page
 * has no `File` object behind it, and the two paths converge the moment
 * something is in storage. Everything downstream needs a name, a path and a
 * reading, and all three exist either way.
 */
interface Analysed {
  id: string;
  fileName: string;
  path: string;
  /** Proof this path was minted for us. Spent at /api/analyze and again at /api/items. */
  grant: string;
  expiresAt: number;
  metadata: FileMetadata;
  durationMs: number | null;
  /** Where the server put a viewable copy, for masters browsers cannot draw. */
  previewPath: string | null;
  /** A short-lived signed URL for that copy, so the contributor sees it at once. */
  previewUrl: string | null;
  analysis: AnalysisResult | null;
  analysisError: string | null;
}

type Grouping = 'one' | 'separate';
type Phase = 'describe' | 'analysing' | 'reviewing' | 'submitting' | 'done';

export function UploadFlow() {
  const t = useMessages();
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [captured, setCaptured] = useState<CapturedLink | null>(null);
  const [grouping, setGrouping] = useState<Grouping>('one');
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [agreed, setAgreed] = useState(false);

  const [phase, setPhase] = useState<Phase>('describe');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysed, setAnalysed] = useState<Analysed[]>([]);
  const [simulated, setSimulated] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [showPreReview, setShowPreReview] = useState(true);
  // The id and its signed receipt. The receipt is the only thing that lets a
  // contributor — who has no account and never will — come back to what they
  // sent, so it is kept alongside the id rather than thrown away.
  const [created, setCreated] = useState<{ id: string; receipt: string }[]>([]);

  const busy = phase === 'analysing' || phase === 'submitting';
  /*
   * A captured page is one record, always.
   *
   * Its two parts — the text and the lead image — are two views of one article,
   * never two items, so the grouping question is not asked and cannot be. That
   * is also why a link and a pile of files are not mixed in one submission:
   * "are these one thing or several" has no sensible answer across both.
   */
  const many = files.length > 1;
  const needsTitle = Boolean(captured) || grouping === 'one' || !many;
  const hasSomething = captured ? true : files.length > 0;
  const canAnalyse = hasSomething && agreed && !busy;

  function reset() {
    setFiles([]);
    setCaptured(null);
    setTitle('');
    setSource('');
    setEmail('');
    setAgreed(false);
    setAnalysed([]);
    setDrafts({});
    setShowPreReview(true);
    setCreated([]);
    setError(null);
    setProgress(null);
    setPhase('describe');
  }

  /** Reads a file the archive already holds. The two paths meet here. */
  async function readStored(input: {
    id: string;
    fileName: string;
    path: string;
    grant: string;
    expiresAt: number;
    durationMs: number | null;
  }): Promise<Analysed> {
    const analyseRes = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: input.path,
        grant: input.grant,
        expiresAt: input.expiresAt,
        title: title.trim() || input.fileName,
      }),
    });
    const read = await analyseRes.json();
    if (!read.ok) throw new Error(read.error.message);

    if (read.data.simulated) setSimulated(true);

    return {
      id: input.id,
      fileName: input.fileName,
      path: input.path,
      grant: input.grant,
      expiresAt: input.expiresAt,
      metadata: read.data.metadata,
      durationMs: input.durationMs,
      previewPath: read.data.previewPath ?? null,
      previewUrl: read.data.previewUrl ?? null,
      analysis: read.data.analysis,
      analysisError: read.data.error ?? null,
    };
  }

  /** Uploads one file, then reads it. */
  async function processOne(picked: PickedFile): Promise<Analysed> {
    const { file } = picked;
    const durationMs = await measureDuration(file);

    const signRes = await fetch('/api/uploads/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, mimeType: file.type, byteSize: file.size }),
    });
    const signed = await signRes.json();
    if (!signed.ok) throw new Error(signed.error.message);

    const supabase = createBrowserSupabase();
    const { error: uploadError } = await supabase.storage
      .from('heritage')
      .uploadToSignedUrl(signed.data.path, signed.data.token, file);

    if (uploadError) {
      // Say what actually went wrong. Replacing this with "check your
      // connection" made a storage rejection indistinguishable from a dropped
      // network, and left nobody anything to act on.
      console.error('[upload] storage rejected the file', uploadError, {
        name: file.name,
        type: file.type,
        size: file.size,
        path: signed.data.path,
      });
      throw new Error(`${file.name} was not accepted by storage: ${uploadError.message}`);
    }

    const analysed = await readStored({
      id: picked.id,
      fileName: file.name,
      path: signed.data.path,
      grant: signed.data.grant,
      expiresAt: signed.data.expiresAt,
      durationMs,
    });

    // The browser already drew a thumbnail for a format it can draw; keep it,
    // so nothing flickers while the signed rendition URL loads.
    return { ...analysed, previewUrl: analysed.previewUrl ?? picked.previewUrl };
  }

  async function runAnalysis() {
    if (!hasSomething) return;
    setError(null);
    setPhase('analysing');

    // A captured page is already in storage — the ingest route put it there —
    // so there is nothing to upload and only the reading is left.
    const total = captured ? captured.files.length : files.length;
    setProgress({ done: 0, total });

    const results: Analysed[] = [];

    try {
      // One at a time. Several 50 MB uploads in parallel is how a phone on a
      // train loses all of them at once, and the model is rate-limited anyway.
      if (captured) {
        for (const file of captured.files) {
          results.push(
            await readStored({
              id: file.path,
              fileName: file.fileName,
              path: file.path,
              grant: file.grant,
              expiresAt: file.expiresAt,
              durationMs: null,
            }),
          );
          setProgress({ done: results.length, total });
        }
      } else {
        for (const picked of files) {
          results.push(await processOne(picked));
          setProgress({ done: results.length, total });
        }
      }

      setAnalysed(results);

      /*
       * Seed the catalogue fields.
       *
       * Only what cleared 70% is here — the gate ran on the server and the
       * rest was never sent. The six column-backed fields are included now:
       * a contributor may correct "Period: 1890s" to "1907, it is written on
       * the back", because they are holding the object and the model is not.
       * Their correction is stored as their claim and never as the record —
       * see writeFields — so a reviewer still decides what the archive says.
       *
       * One record made of several files gets the merged set, because the
       * imprint is usually on page one and the date on page three.
       */
      const asValues = (suggestions: { key: string; value: string; basis: 'read' | 'inferred' | 'guess'; note: string | null }[]) =>
        suggestions.map((s) => ({
          key: s.key,
          value: s.value,
          source: 'ai' as const,
          basis: s.basis,
          note: s.note,
          // Kept beside the value so the sheet can tell a correction from an
          // addition, and so the change can be undone.
          suggested: s.value,
        }));

      const fieldsFor = (entry: Analysed) => asValues(entry.analysis?.fields ?? []);
      const mergedFields = asValues(mergeSuggestions(results.map((entry) => entry.analysis?.fields ?? [])));

      const perRecord = !captured && grouping === 'separate' && files.length > 1;

      setDrafts(
        Object.fromEntries(
          results.map((entry, index) => [
            entry.id,
            {
              title: needsTitle ? title.trim() : stemOf(entry.fileName),
              description: entry.analysis?.summary ?? '',
              keywords: entry.analysis?.keywords ?? [],
              fields: perRecord ? fieldsFor(entry) : index === 0 ? mergedFields : [],
            },
          ]),
        ),
      );
      setShowPreReview(true);
      setPhase('reviewing');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('upload.error.generic'));
      setPhase('describe');
    } finally {
      setProgress(null);
    }
  }

  async function submit() {
    if (!analysed.length) return;
    if (!agreed) {
      setError(t('upload.error.consent'));
      return;
    }
    setError(null);
    setPhase('submitting');

    // One record with every file, or one record per file. The contributor said
    // which; nothing here is inferred.
    const payloads =
      captured || grouping === 'one' || !many
        ? [
            {
              /*
               * The file name when nothing was typed.
               *
               * The screen says "blanks are fine" and means it, but the record
               * needs something to be called: submitting without a title used
               * to reach the API, fail its length check, and come back as
               * "Some fields need attention" naming no field. The analysis step
               * already falls back to the file name, and a record called
               * "ketuba-detail" that a volunteer renames is a better outcome
               * than a submission a contributor cannot get past.
               */
              title: title.trim() || captured?.title || stemOf(analysed[0].fileName),
              draftKey: analysed[0].id,
              entries: analysed,
            },
          ]
        : analysed.map((entry) => ({
            title: drafts[entry.id]?.title?.trim() || stemOf(entry.fileName),
            draftKey: entry.id,
            entries: [entry],
          }));

    try {
      const made: { id: string; receipt: string }[] = [];

      for (const payload of payloads) {
        const draft = drafts[payload.draftKey];
        const res = await fetch('/api/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: payload.title,
            source: source.trim() || null,
            // Written by the ingest route, never typed. It is the difference
            // between "I found this online" and a checkable address.
            sourceUrl: captured?.sourceUrl ?? null,
            contributorEmail: email.trim() || null,
            contributorFullName: fullName.trim() || null,
            consentVersion: CONSENT_VERSION,
            contributorDescription: draft?.description?.trim() || null,
            contributorKeywords: draft?.keywords ?? [],
            // The whole set as they left it, not a change list. A field they
            // deleted is a field they decided the record does not have.
            contributorFields: (draft?.fields ?? [])
              .filter((f) => f.value.trim().length > 0)
              .map((f) => ({ key: f.key, value: f.value.trim() })),
            files: payload.entries.map((entry) => ({
              path: entry.path,
              grant: entry.grant,
              expiresAt: entry.expiresAt,
              fileName: entry.fileName,
              mimeType: entry.metadata.mimeType,
              byteSize: entry.metadata.byteSize,
              width: entry.metadata.width ?? null,
              height: entry.metadata.height ?? null,
              durationMs: entry.durationMs,
              previewPath: entry.previewPath,
              analysis: entry.analysis,
              analysisError: entry.analysisError,
            })),
          }),
        });

        const body = await res.json();
        if (!body.ok) throw new Error(readableError(body.error));
        made.push({ id: body.data.id, receipt: body.data.receipt });
      }

      setCreated(made);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('upload.error.save'));
      setPhase('reviewing');
    }
  }

  if (phase === 'done') {
    return (
      <div className="card animate-rise rounded-2xl border-positive/30 bg-sage-wash p-10 text-center">
        <RingMark size={64} color="var(--color-positive)" className="mx-auto text-positive">
          <Check size={28} strokeWidth={2.2} />
        </RingMark>
        <h2 className="mt-4 font-display text-xl sm:text-2xl">
          {created.length > 1
            ? t('upload.done.many', { count: created.length })
            : t('upload.done.one')}
        </h2>
        <p className="mx-auto mt-2 max-w-md leading-relaxed text-muted">
          A volunteer checks the description and the suggestions against the original. It appears in
          the public portal once it is approved.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={reset}
            className={buttonClass('primary')}
          >
            {t('upload.contributeAnother')}
          </button>
          <Link href="/portal" className={buttonClass('quiet')}>
            {t('common.backToPortal')}
          </Link>
        </div>
        {created.length > 0 && (
          /*
           * The way back.
           *
           * This used to print the first eight characters of the record id
           * under the word "Reference", which looked like it meant something
           * and did not — nothing in the archive accepted it as input, and a
           * contributor who wanted to know whether their grandmother's
           * photograph had been published had no way to find out. These are
           * real links, they do not expire, and they need no account.
           */
          <div className="mt-7 border-t border-rule pt-6 text-start">
            <p className="font-medium">
              {created.length > 1 ? t('upload.done.keepLinks') : t('upload.done.keepLink')}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {created.length > 1 ? 'They show you' : 'It shows you'} what happens next —
              whether a volunteer has published{' '}
              {created.length > 1 ? 'each contribution' : 'it'} yet. Save{' '}
              {created.length > 1 ? 'them' : 'it'} somewhere; we have no other way to reach you.
            </p>
            <ul className="mt-3 space-y-2">
              {created.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/receipt/${row.id}?t=${row.receipt}`}
                    className="machine block truncate rounded-lg border border-rule bg-paper px-3 py-2.5 text-sm underline underline-offset-2 transition-colors hover:border-accent-strong hover:bg-accent-wash"
                  >
                    /receipt/{row.id.slice(0, 8)}…
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-10 sm:space-y-14">
      <Step
        number="01"
        title={captured ? t('upload.step.filesRead') : t('upload.step.files')}
        hint={
          captured
            ? 'A copy of the text and the picture is kept here, so the record survives the page coming down.'
            : t('upload.step.filesHint')
        }
        done={hasSomething}
      >
        {/* Files or a link, not both. A captured page is one record made of two
            views of itself, so "are these one item or several" has no answer
            that spans the two. */}
        {!captured && <FilePicker files={files} onChange={setFiles} disabled={busy} />}

        {files.length === 0 && (
          <div className={captured ? undefined : 'mt-6 border-t border-rule pt-6'}>
            {!captured && <p className="eyebrow mb-2.5">{t('upload.step.orAddress')}</p>}
            <LinkInput
              captured={captured}
              onCapture={setCaptured}
              onClear={() => setCaptured(null)}
              disabled={busy}
            />
          </div>
        )}
      </Step>

      {/*
        Locked once the files have been read.

        The grouping decides how the catalogue fields are distributed across
        drafts, and that happens at analysis time. Changing it afterwards left
        the two out of step: submit re-read `grouping` fresh while the drafts
        still held the old shape, so switching "separate" to "one" dropped every
        field but the first record's, and switching the other way submitted
        empty field sets. Both reported success.
      */}
      {many && !captured && (
        <Step
          number="02"
          title={t('upload.step.grouping')}
          hint={
            analysed.length > 0
              ? t('upload.step.groupingSettled')
              : t('upload.step.groupingOpen')
          }
          done
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <GroupingChoice
              active={grouping === 'one'}
              onClick={() => setGrouping('one')}
              disabled={busy || analysed.length > 0}
              label={t('upload.step.onePages')}
              detail={`One record with ${files.length} files — a document scanned page by page, or one object photographed from several sides.`}
            />
            <GroupingChoice
              active={grouping === 'separate'}
              onClick={() => setGrouping('separate')}
              disabled={busy || analysed.length > 0}
              label={t('upload.step.separate')}
              detail={`${files.length} records, each reviewed on its own — unrelated photographs or documents from the same collection.`}
            />
          </div>
        </Step>
      )}

      <Step
        number={many ? '03' : '02'}
        title={t('upload.step.tell')}
        hint="Whatever you have. Blanks are fine — a volunteer fills the rest."
        done={agreed}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {needsTitle && (
            <label className="block">
              <span className="eyebrow mb-1.5 block">{t('upload.field.title')}</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                disabled={busy}
                placeholder={t('upload.field.titlePlaceholder')}
                className="h-13 w-full rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:bg-accent-wash/30 focus:outline-none"
              />
            </label>
          )}

          <label className="block">
            <span className="eyebrow mb-1.5 block">{t('upload.field.origin')}</span>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              maxLength={200}
              disabled={busy}
              placeholder={t('upload.field.originPlaceholder')}
              className="h-13 w-full rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:bg-accent-wash/30 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="eyebrow mb-1.5 block">{t('upload.field.yourName')}</span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={120}
              disabled={busy}
              placeholder={t('upload.field.yourNamePlaceholder')}
              className="h-13 w-full rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:bg-accent-wash/30 focus:outline-none"
            />
            {/* The reason is worth giving, because "why do you want my name"
                is a fair question and the answer is a good one: a surname is
                the strongest single clue to which family a photograph belongs
                to, and the archive would otherwise be guessing it from a file
                name. */}
            <span className="mt-1.5 block text-sm text-muted">
              A family name helps place the material. It is not published unless a volunteer
              decides the family belongs on the record.
            </span>
          </label>

          <label className="block">
            <span className="eyebrow mb-1.5 block">{t('upload.field.yourEmail')}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={160}
              disabled={busy}
              placeholder="you@example.com"
              className="h-13 w-full rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:bg-accent-wash/30 focus:outline-none"
            />
            <span className="mt-1.5 block text-sm text-muted">
              So a volunteer can come back to you with a question, and so your contributions can be
              kept together. It is not an account and it is never shown in the portal.
            </span>
          </label>



        </div>
      </Step>

      <Step number={many ? '04' : '03'} title={t('upload.step.read')} done={analysed.length > 0}>
        {/* Agreement sits here rather than at submission, because this is the
            button that sends the file out of the building to Google. */}
        <div className="mb-4">
          <ConsentBlock agreed={agreed} onChange={setAgreed} disabled={busy} />
        </div>

        <button
          onClick={runAnalysis}
          disabled={!canAnalyse}
          className={cn(
            buttonClass('accent', 'h-14 w-full text-lg'),
            !canAnalyse && 'pointer-events-none bg-paper-3 text-muted shadow-none',
          )}
        >
          {phase === 'analysing' ? (
            <>
              <Loader2 size={17} className="animate-spin" />
              {progress && progress.total > 1
                ? `Reading file ${progress.done + 1} of ${progress.total}…`
                : t('upload.action.reading')}
            </>
          ) : (
            <>
              <Sparkles size={17} />
              {captured
                ? t('upload.action.analysePage')
                : files.length > 1
                  ? `Analyse ${files.length} files`
                  : t('upload.action.analyseItem')}
            </>
          )}
        </button>
        {!canAnalyse && !busy && (
          <p className="mt-2 text-sm text-muted">
            {!hasSomething
              ? 'Add at least one file, or paste a link.'
              : 'Tick the box above to confirm you may share this material.'}
          </p>
        )}
      </Step>

      {error && (
        <p role="alert" className="animate-rise rounded-lg border-s-[3px] border-critical bg-critical/8 px-4 py-3.5 text-critical">
          {error}
        </p>
      )}

      {(phase === 'reviewing' || phase === 'submitting') && (
        <PreReview
          entries={analysed.map((entry) => ({
            id: entry.id,
            fileName: entry.fileName,
            // The server's viewable copy wins: for a TIFF it is the only thing
            // that draws, and for everything else the two are the same picture.
            previewUrl: entry.previewUrl,
            analysis: entry.analysis,
            analysisError: entry.analysisError,
            metadata: entry.metadata,
            durationMs: entry.durationMs,
          }))}
          drafts={drafts}
          onDraftChange={(id, draft) => setDrafts((all) => ({ ...all, [id]: draft }))}
          perItemTitles={grouping === 'separate' && many}
          simulated={simulated}
          hidden={!showPreReview}
          // Not `setShowPreReview` directly: the callback reports whether the
          // panel is now hidden, and the state records whether it is shown.
          onHiddenChange={(nowHidden) => setShowPreReview(!nowHidden)}
          onSubmit={submit}
          submitting={phase === 'submitting'}
          blocked={!agreed}
        />
      )}
    </div>
  );
}

/**
 * An error a person can act on.
 *
 * A validation failure comes back as a generic sentence plus a map of the
 * fields that failed. Showing only the sentence leaves "Some fields need
 * attention" on screen with nothing to attend to, which is how a contributor
 * gets stuck on a form they cannot see the problem in.
 */
function readableError(error: { message: string; fields?: Record<string, string> }): string {
  const named = Object.entries(error.fields ?? {});
  if (!named.length) return error.message;
  return `${error.message} ${named.map(([field, why]) => `${field}: ${why}`).join('. ')}`;
}

/** "ketuba-detail.jpg" -> "ketuba-detail". A starting point, not a title. */
function stemOf(fileName: string): string {
  return fileName.replace(/\.[A-Za-z0-9]{1,10}$/, '') || fileName;
}

function GroupingChoice({
  active,
  onClick,
  disabled,
  label,
  detail,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  label: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        'card rounded-xl p-5 text-left transition-all duration-200',
        active
          ? 'border-accent-strong bg-accent-wash shadow-lift'
          : 'card-interactive hover:border-accent-strong',
      )}
    >
      <span className="block font-display text-lg">{label}</span>
      <span className="mt-1.5 block text-sm leading-relaxed text-muted">{detail}</span>
    </button>
  );
}

/**
 * One rung of the contribution flow.
 *
 * Numbered because this genuinely is a sequence — the outline warns against
 * numbering things that are merely a list, and four steps in a fixed order is
 * not that. The rung's ring fills in once the step has something in it, so the
 * page answers "where am I" without anybody having to read it.
 */
function Step({
  number,
  title,
  hint,
  done = false,
  children,
}: {
  number: string;
  title: React.ReactNode;
  hint?: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Reveal as="section" className="relative">
      <div className="mb-4 flex items-center gap-3.5 sm:mb-5 sm:items-start">
        <RingMark
          size={44}
          color={done ? 'var(--color-sage)' : 'var(--color-rule-strong)'}
          className={done ? 'text-sage' : 'text-muted'}
        >
          {done ? (
            <Check size={19} strokeWidth={2.4} />
          ) : (
            <span className="font-mono font-medium">{number}</span>
          )}
        </RingMark>

        <h2 className="font-display text-xl leading-tight sm:pt-1.5 sm:text-2xl">{title}</h2>
      </div>

      {/* The hint sits under the whole header on a phone: beside the ring it
          left a ragged edge and about two words to a line. */}
      {hint && <p className="mb-4 text-muted sm:mb-5 sm:ps-[3.75rem]">{hint}</p>}

      <div className="sm:ps-[3.75rem]">{children}</div>
    </Reveal>
  );
}
