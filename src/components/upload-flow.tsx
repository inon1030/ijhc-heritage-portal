'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { ConsentBlock } from '@/components/consent-block';
import { RingMark, buttonClass } from '@/components/primitives';
import { FilePicker, type PickedFile } from '@/components/file-picker';
import { LinkInput, type CapturedLink } from '@/components/link-input';
import { PreReview, type Draft, type OfferedTerm } from '@/components/pre-review';
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

export function UploadFlow({ vocabulary }: { vocabulary: OfferedTerm[] }) {
  const t = useMessages();
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [captured, setCaptured] = useState<CapturedLink | null>(null);
  const [grouping, setGrouping] = useState<Grouping>('one');
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [agreed, setAgreed] = useState(false);

  /*
   * Three screens, not one long page.
   *
   * The whole form used to be visible at once: pick a file, answer six
   * questions, tick a box, press analyse. That is a form for somebody who
   * already knows what the archive wants. The people this is built for are
   * families with a shoebox, and the difference between "one thing at a time"
   * and "here is everything" is whether they finish.
   */
  const [screen, setScreen] = useState<1 | 2 | 3>(1);

  /**
   * What the contributor says they know, in their own words.
   *
   * This is the most valuable field on the page and it did not exist. The
   * model is looking at a faded print; the person typing is holding it and
   * knows whose grandmother that is. It goes to the model as fact.
   */
  const [known, setKnown] = useState('');
  /** Which language the AI should write its reading in. */
  const [analysisLang, setAnalysisLang] = useState('English');
  /** Fields the contributor has said outright they cannot answer. */
  const [dontKnow, setDontKnow] = useState<Record<string, boolean>>({});

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
  /*
   * The address is the one thing the archive insists on now.
   *
   * It was optional, and optional meant a contribution arriving with no way to
   * ask "who is this in the photograph?" — which is the question that turns a
   * scan into a record. Validated in the shape a form can validate: an address
   * that is obviously not one is caught here, and one that is merely wrong is
   * caught when nobody replies.
   */
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const canAnalyse = hasSomething && agreed && emailOk && !busy;

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
    setScreen(1);
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
        // The contributor's own account, and the language they want it back in.
        // Both go to the model; `known` goes as fact, not as a hint.
        known: known.trim() || undefined,
        language: analysisLang,
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
      setScreen(3);
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
      setScreen(3);
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

  /*
   * The step label sits on the heading's line, not above it.
   *
   * On its own row it cost 24px plus its margin on every screen — and screen
   * two was ten pixels past the fold, so those 24 were the difference between
   * a form you can see and a form you have to scroll. It also read oddly
   * stacked: an eyebrow, then a heading larger than the page's own title.
   */
  const heading = (title: string, hint: string) => (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="font-display text-2xl leading-tight sm:text-3xl lg:text-4xl">{title}</h2>
        <span className="eyebrow text-[0.82rem]">{t('flow.step', { n: screen })}</span>
      </div>
      <p className="mt-2 text-[1.05rem] leading-snug text-muted lg:text-[1.15rem]">{hint}</p>
    </>
  );

  return (
    <div>
      {/*
        One screen at a time.

        Everything below used to be on one page: pick a file, answer six
        questions, tick a box, press analyse. That is a form for somebody who
        already knows what the archive wants. The people it is built for are
        families with a shoebox, and one thing at a time is the difference
        between finishing and closing the tab.
      */}
      <div className="mb-8 flex gap-1.5" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              n <= screen ? 'bg-accent-strong' : 'bg-rule',
            )}
          />
        ))}
      </div>

      {/* ── 1. what you have ─────────────────────────────────────────────── */}
      {screen === 1 && (
        <section className="animate-rise">
          {heading(t('flow.s1.title'), t('flow.s1.hint'))}

          {/*
            A file, or an address — beside each other rather than stacked.
            
            They are two answers to one question, and stacking them made the
            second look like a step after the first. Side by side they read as
            the choice they are, and the screen is half as tall.
          */}
          <div className={cn('mt-5 gap-6', files.length === 0 && !captured && 'lg:grid lg:grid-cols-2')}>
            {!captured && <FilePicker files={files} onChange={setFiles} disabled={busy} />}
            {files.length === 0 && (
              <div className={cn(!captured && 'mt-6 lg:mt-0')}>
                {!captured && <p className="eyebrow mb-2.5">{t('upload.step.orAddress')}</p>}
                <LinkInput
                  captured={captured}
                  onCapture={setCaptured}
                  onClear={() => setCaptured(null)}
                  disabled={busy}
                />
              </div>
            )}
          </div>

          {many && !captured && (
            <div className="mt-8 border-t border-rule pt-6">
              <p className="eyebrow mb-1">{t('upload.step.grouping')}</p>
              <p className="mb-3 text-sm text-muted">{t('upload.step.groupingOpen')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <GroupingChoice
                  active={grouping === 'one'}
                  onClick={() => setGrouping('one')}
                  label={t('upload.step.onePages')}
                  detail="Front and back, or the pages of one letter."
                  disabled={busy}
                />
                <GroupingChoice
                  active={grouping === 'separate'}
                  onClick={() => setGrouping('separate')}
                  label={t('upload.step.separate')}
                  detail="Different photographs, each its own record."
                  disabled={busy}
                />
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center gap-4">
            <button
              type="button"
              onClick={() => setScreen(2)}
              disabled={!hasSomething}
              className={cn(
                buttonClass('primary', 'h-13 px-8'),
                !hasSomething && 'pointer-events-none bg-paper-3 text-muted shadow-none',
              )}
            >
              {t('flow.next')}
            </button>
            {!hasSomething && <span className="text-sm text-muted">{t('flow.needFile')}</span>}
          </div>
        </section>
      )}

      {/* ── 2. what you know ─────────────────────────────────────────────── */}
      {screen === 2 && (
        <section className="animate-rise">
          {heading(t('flow.s2.title'), t('flow.s2.hint'))}

          <div className="mt-5 space-y-4">
            {/*
              The address, and the only thing on this page that is required.

              It was optional, and optional meant contributions arriving with no
              way to ask "who is this in the photograph?" — the question that
              turns a scan into a record.
            */}
            <div className="gap-6 lg:grid lg:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
                <span className="eyebrow text-[0.82rem]">
                  {t('flow.email')} <span className="text-critical">*</span>
                </span>
                {/* Beside the label, not under the field: the same sentence,
                    one row instead of two. */}
                <span className="text-sm text-muted">{t('flow.emailWhy')}</span>
              </span>
              <input
                type="email"
                dir="ltr"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-invalid={email.trim().length > 0 && !emailOk}
                className={cn(
                  'h-14 w-full rounded-lg border bg-paper px-4 text-[1.05rem] focus:outline-none',
                  email.trim().length > 0 && !emailOk
                    ? 'border-critical focus:border-critical'
                    : 'border-rule focus:border-accent-strong',
                )}
              />
              {email.trim().length > 0 && !emailOk && (
                <span className="mt-1.5 block text-sm text-critical">{t('flow.emailInvalid')}</span>
              )}

            </label>

            {/*
              The most valuable field here, and it did not exist before.

              The model is looking at a faded print. The person typing is
              holding it and knows whose grandmother that is. What they write
              goes to the model as fact, not as a hint to weigh against pixels.
            */}
            <label className="mt-4 block lg:mt-0">
              <span className="eyebrow mb-2 block text-[0.82rem]">{t('flow.whatYouKnow')}</span>
              <textarea
                value={known}
                onChange={(e) => setKnown(e.target.value)}
                rows={3}
                maxLength={2000}
                dir="auto"
                placeholder={t('flow.whatYouKnowPlaceholder')}
                className="w-full resize-y rounded-lg border border-rule bg-paper px-4 py-3 text-[1.05rem] leading-relaxed focus:border-accent-strong focus:outline-none"
              />
              <span className="mt-1 block text-sm text-muted">{t('flow.whatYouKnowHint')}</span>
            </label>
            </div>

            {/*
              Four short answers on one row where there is room.
              
              Two columns of two put 260px of form between the description and
              the button that runs the analysis; at four they are one row of
              130. None of them is a long answer — a title, a place, a name and
              a language — so none of them needs half the width.
            */}
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <Answerable
                id="title"
                label={t('upload.field.title')}
                placeholder={t('upload.field.titlePlaceholder')}
                value={title}
                onChange={setTitle}
                dontKnow={dontKnow}
                setDontKnow={setDontKnow}
                disabled={busy}
              />
              <Answerable
                id="source"
                label={t('upload.field.origin')}
                placeholder={t('upload.field.originPlaceholder')}
                value={source}
                onChange={setSource}
                dontKnow={dontKnow}
                setDontKnow={setDontKnow}
                disabled={busy}
              />
              <Answerable
                id="fullName"
                label={t('upload.field.yourName')}
                placeholder={t('upload.field.yourNamePlaceholder')}
                value={fullName}
                onChange={setFullName}
                dontKnow={dontKnow}
                setDontKnow={setDontKnow}
                disabled={busy}
              />
              <label className="block">
                <span className="eyebrow mb-2 block text-[0.82rem]">{t('flow.language')}</span>
                <select
                  value={analysisLang}
                  onChange={(e) => setAnalysisLang(e.target.value)}
                  className="h-14 w-full rounded-lg border border-rule bg-paper px-4 text-[1.05rem] focus:border-accent-strong focus:outline-none"
                >
                  {ANALYSIS_LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>

              </label>
            </div>

            {/* Agreement sits on the button that sends the file out of the
                building to Google, not at submission. */}
            <ConsentBlock agreed={agreed} onChange={setAgreed} disabled={busy} />
          </div>

          {error && (
            <p role="alert" className="mt-5 rounded-lg border-s-[3px] border-critical bg-critical/8 px-4 py-3.5 text-critical">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setScreen(1)}
              disabled={busy}
              className={buttonClass('quiet', 'h-13 px-6')}
            >
              {t('flow.back')}
            </button>
            <button
              type="button"
              onClick={runAnalysis}
              disabled={!canAnalyse}
              className={cn(
                buttonClass('accent', 'h-13 flex-1 px-8 text-lg sm:flex-none'),
                !canAnalyse && 'pointer-events-none bg-paper-3 text-muted shadow-none',
              )}
            >
              {phase === 'analysing' ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  {progress && progress.total > 1
                    ? `${progress.done + 1} / ${progress.total}`
                    : t('flow.analysing')}
                </>
              ) : (
                <>
                  <Sparkles size={17} />
                  {t('flow.analyse')}
                </>
              )}
            </button>
            {!canAnalyse && !busy && (
              <span className="text-sm text-muted">
                {!emailOk ? t('flow.emailMissing') : !agreed ? t('flow.needConsent') : ''}
              </span>
            )}
          </div>
        </section>
      )}

      {/* ── 3. what the AI made of it ────────────────────────────────────── */}
      {screen === 3 && (
        <section className="animate-rise">
          {heading(t('flow.s3.title'), t('flow.s3.hint'))}

          {error && (
            <p role="alert" className="mt-5 rounded-lg border-s-[3px] border-critical bg-critical/8 px-4 py-3.5 text-critical">
              {error}
            </p>
          )}

          <div className="mt-6">
            <PreReview
              entries={analysed.map((entry) => ({
                id: entry.id,
                fileName: entry.fileName,
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
              onHiddenChange={(nowHidden) => setShowPreReview(!nowHidden)}
              onSubmit={submit}
              submitting={phase === 'submitting'}
              blocked={!agreed}
              vocabulary={vocabulary}
            />
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={() => setScreen(2)}
              disabled={busy}
              className={buttonClass('quiet', 'h-12 px-6')}
            >
              {t('flow.back')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * The languages the AI will write its reading in.
 *
 * Plain English names rather than the archive's own language table, because
 * this is a sentence handed to a model — "Write the summary in Marathi" — and
 * not a record's language. The list is wider than what the archive publishes
 * in on purpose: a Judeo-Arabic ketubah is better described in Hebrew than in
 * an English the family will not read.
 */
const ANALYSIS_LANGUAGES = [
  'English',
  'Hebrew',
  'Hindi',
  'Marathi',
  'Malayalam',
] as const;

/**
 * A field somebody may simply not be able to answer.
 *
 * "I don't know" is a real answer and the archive already treats it as one —
 * a null is better than a guess (decision 11). Saying so out loud is kinder
 * than an empty box, which reads as a question you failed. Ticking it clears
 * and locks the field so nothing half-typed is sent.
 */
function Answerable({
  id,
  label,
  placeholder,
  value,
  onChange,
  dontKnow,
  setDontKnow,
  disabled,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  dontKnow: Record<string, boolean>;
  setDontKnow: (next: Record<string, boolean>) => void;
  disabled: boolean;
}) {
  const t = useMessages();
  const unknown = Boolean(dontKnow[id]);

  return (
    <label className="block">
      <span className="eyebrow mb-2 block text-[0.82rem]">{label}</span>
      <input
        value={unknown ? '' : value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || unknown}
        placeholder={unknown ? '' : placeholder}
        maxLength={200}
        dir="auto"
        className="h-14 w-full rounded-lg border border-rule bg-paper px-4 text-[1.05rem] focus:border-accent-strong focus:outline-none disabled:bg-paper-2 disabled:text-muted"
      />
      <span className="mt-1.5 flex items-center gap-2 text-[0.95rem] text-muted">
        <input
          type="checkbox"
          checked={unknown}
          disabled={disabled}
          onChange={(e) => {
            setDontKnow({ ...dontKnow, [id]: e.target.checked });
            if (e.target.checked) onChange('');
          }}
          className="h-4 w-4 rounded border-rule-strong accent-[var(--color-accent-strong)]"
        />
        {t('flow.dontKnow')}
      </span>
    </label>
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

