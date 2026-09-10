'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Sparkles } from 'lucide-react';
import { ConsentBlock } from '@/components/consent-block';
import { RingMark, buttonClass } from '@/components/primitives';
import { FilePicker, type PickedFile } from '@/components/file-picker';
import { LinkInput, type CapturedLink } from '@/components/link-input';
import { PreReview, type Draft, type OfferedTerm } from '@/components/pre-review';
import type { PickableLanguage } from '@/components/language-picker';
import { CONSENT_VERSION } from '@/lib/consent';
import { MessagesProvider, useMessages } from '@/lib/i18n/provider';
import { lockLanguage } from '@/lib/i18n/language-lock';
import { en, format, type MessageKey } from '@/lib/i18n/messages';
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

export function UploadFlow({
  vocabulary,
  mark,
  languages,
  siteLanguage,
}: {
  vocabulary: OfferedTerm[];
  /** The code of the language the site is currently in. */
  siteLanguage: string;
  /**
   * The languages the archive publishes in. Handed down for the switch under
   * the scanned text at pre-review, so a contributor can read the machine's
   * reading of their own document before anybody else sees it.
   */
  languages: PickableLanguage[];
  /**
   * The Center's mark, handed down rather than imported.
   *
   * `Logo` reads the public directory to decide whether a supplied file
   * exists, so importing it here would pull `node:fs` into the client bundle —
   * which took every page of the deployed site down once already. The entry
   * animation gets its mark the same way, for the same reason.
   */
  mark: React.ReactNode;
}) {
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
  /**
   * Which language the AI should write its reading in.
   *
   * It starts at the language the site is in, rather than at English. Somebody
   * who has already told the archive they read Marathi has answered this
   * question; asking it again and defaulting to English is asking them to
   * answer it twice and punishing them for missing it. English remains one
   * choice of five rather than the assumption.
   *
   * The *value* is the language's English name, because that is what goes to
   * the model in the prompt. The *label* is its own name in its own script,
   * because that is what a person reads.
   */
  const [analysisLang, setAnalysisLang] = useState(
    () => languages.find((l) => l.code === siteLanguage)?.label_en ?? 'English',
  );

  /** The chosen reading language as a row, for its code and its direction. */
  const reading = languages.find((l) => l.label_en === analysisLang) ?? null;

  /**
   * Every language of each reading, made once, before anybody asks.
   *
   * Keyed by the entry's id. The switch under the scanned text reads from here
   * first, so moving between Hebrew, Marathi and the original is instant rather
   * than a round trip each. What is missing here — a passage too long to render
   * five times, a language the model wrote in the wrong script — simply falls
   * through to the on-demand call, which is what the switch did before.
   */
  const [readings, setReadings] = useState<
    Record<string, Record<string, Record<string, string>>>
  >({});

  /*
   * ── the pre-review belongs to the reading, not to the site ────────────────
   *
   * A contributor who asked for the machine to read their document in Marathi
   * is then asked whether it read it correctly. Putting that question to them
   * in English — because the kiosk, or the last person to use this browser, had
   * the site in English — is asking somebody to check work in a language they
   * have just told you they do not read.
   *
   * So screen three follows the reading language and the rest of the site does
   * not move. The catalogue is fetched rather than shipped: five of them in
   * every page would be five times the payload on every route in the archive,
   * for a case that only arises when somebody changes the default.
   *
   * Nothing is blocked on it. Until it arrives, the site's own language is
   * used — a screen in the wrong language is a great deal better than a screen
   * that is not there.
   */
  const [catalogues, setCatalogues] = useState<Record<string, Record<string, string>>>({});

  /*
   * Which language screen three is in, worked out during render rather than
   * stored.
   *
   * The first version kept `flowCatalogue` in state and cleared it from an
   * effect, which is a state write on every render where the two languages
   * agree — the common case — and the compiler is right to refuse it. Here the
   * answer is a function of the reading language and what has been fetched, and
   * the only thing state holds is the fetches themselves, keyed so that
   * switching back and forth costs nothing the second time.
   */
  const overrideCode = reading && reading.code !== siteLanguage ? reading.code : null;
  const flowCatalogue = overrideCode ? (catalogues[overrideCode] ?? null) : null;

  useEffect(() => {
    if (!overrideCode || catalogues[overrideCode]) return;
    let live = true;
    fetch(`/api/i18n/${overrideCode}`)
      .then((response) => response.json())
      .then((body) => {
        if (!live || !body?.ok) return;
        setCatalogues((held) => ({
          ...held,
          [overrideCode]: body.data.catalogue as Record<string, string>,
        }));
      })
      .catch(() => {
        // The words stay in the site's language. Nothing else changes.
      });
    return () => {
      live = false;
    };
  }, [overrideCode, catalogues]);

  /**
   * `t` for screen three.
   *
   * A provider only reaches child components; the strings in this component's
   * own JSX were resolved by the `useMessages` call at the top of it and would
   * stay in the site's language however the subtree is wrapped. So the subtree
   * gets the provider and this function covers what is drawn here.
   */
  const tFlow = useMemo(() => {
    const table = flowCatalogue;
    if (!table) return t;
    return (key: MessageKey, vars?: Record<string, string | number>) =>
      format(table[key] ?? en[key] ?? key, vars);
  }, [flowCatalogue, t]);
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

  /*
   * From the moment the reading language is chosen until the contribution is
   * sent, the site's language control is not on the page.
   *
   * Screen two is where that choice is made, and from there the pre-review, the
   * catalogue fields and the machine's own prose all belong to it. The control
   * in the strip changes the *site* language by reloading — which mid-flow
   * discards the files, the address, the consent and the reading, with nothing
   * on the button to warn anybody. So it goes, and comes back on the receipt.
   *
   * A knowledge expert keeps it: they are exempt in `LanguagePicker`, because
   * on the review screen changing the language is the feature.
   */
  useEffect(() => {
    if (screen < 2 || phase === 'done') return;
    return lockLanguage();
  }, [screen, phase]);

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

      /*
       * The head start, fired as the screen appears rather than awaited.
       *
       * One call per file that actually carries text — a photograph with
       * nothing written on it makes no request at all — and it is deliberately
       * not awaited: the contributor should be reading the summary while this
       * happens, not watching a second spinner after the first one finished.
       * Whatever lands, lands; whatever does not is asked for on the click.
       */
      void prefetchReadings(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('upload.error.generic'));
      setPhase('describe');
    } finally {
      setProgress(null);
    }
  }

  /** Ask for every language of every reading that has one. Never throws. */
  async function prefetchReadings(entries: Analysed[]) {
    await Promise.all(
      entries.map(async (entry) => {
        const blocks = [
          { key: 'ocrText' as const, text: entry.analysis?.ocrText ?? '' },
          { key: 'transcript' as const, text: entry.analysis?.transcript ?? '' },
        ].filter((block) => block.text.trim());
        if (!blocks.length) return;

        try {
          const response = await fetch('/api/analyze/translate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              path: entry.path,
              grant: entry.grant,
              expiresAt: entry.expiresAt,
              // Every language but the one the reading is already in. The
              // "Original" chip is that language, and asking the model to put
              // Marathi into Marathi is a call spent on what is on screen.
              langs: languages.filter((l) => l.code !== reading?.code).map((l) => l.code),
              sourceLanguage: entry.analysis?.language,
              blocks,
            }),
          });
          const body = await response.json();
          if (!response.ok || !body?.ok) return;

          const made = body.data.languages as Record<string, Record<string, string>>;
          if (!made || !Object.keys(made).length) return;
          setReadings((held) => ({ ...held, [entry.id]: made }));
        } catch {
          // The switch still works one language at a time. Nothing is lost but
          // the head start, and saying so on screen would be noise.
        }
      }),
    );
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
          A knowledge expert checks the description and the suggestions against the original. It appears in
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
            {/*
              One sentence per case, not one sentence assembled from six
              fragments. Word order is not a constant: the English reads
              "They show you whether…" and the Hebrew does not put those
              pieces in that order, so a sentence stitched together here can
              only ever be right in the language it was stitched for.
            */}
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {t(created.length > 1 ? 'upload.done.linksExplainMany' : 'upload.done.linkExplain')}
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
  const heading = (title: string, hint: string, say = t) => (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="font-display text-2xl leading-tight sm:text-3xl lg:text-4xl">{title}</h2>
        {/* The step counter belongs to the screen it counts, so it takes the
            same reader as the heading above it — screen three's is the
            contributor's reading language, not the site's. */}
        <span className="eyebrow text-[0.82rem]">{say('flow.step', { n: screen })}</span>
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
                  detail={t('flow.together')}
                  disabled={busy}
                />
                <GroupingChoice
                  active={grouping === 'separate'}
                  onClick={() => setGrouping('separate')}
                  label={t('upload.step.separate')}
                  detail={t('flow.separate')}
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

          {phase === 'analysing' ? (
            <div className="mt-6">
              <Thinking mark={mark} fileName={files[0]?.file.name ?? captured?.title ?? null} progress={progress} />
            </div>
          ) : (
          <>
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
                  {/*
                    The archive's own languages, not a list beside them. This
                    was five English words hard-coded here, so adding
                    Judeo-Arabic as a row in `archive_languages` would have
                    added it to the site and not to this menu — and a reader
                    picking their language saw it named in a language they may
                    not read.
                  */}
                  {languages.map((l) => (
                    <option key={l.code} value={l.label_en}>
                      {l.label_native === l.label_en
                        ? l.label_en
                        : `${l.label_native} · ${l.label_en}`}
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
              {/* No spinner here any more: while it reads, this whole form is
                  replaced by `Thinking`, so this button is never on screen in
                  that state. TypeScript said so before I noticed. */}
              <Sparkles size={17} />
              {t('flow.analyse')}
            </button>
            {!canAnalyse && !busy && (
              <span className="text-sm text-muted">
                {!emailOk ? t('flow.emailMissing') : !agreed ? t('flow.needConsent') : ''}
              </span>
            )}
          </div>
          </>
          )}
        </section>
      )}

      {/* ── 3. what the AI made of it ────────────────────────────────────── */}
      {screen === 3 && (
        <section
          className="animate-rise"
          /*
            The direction follows the reading too. Hebrew checked inside an
            English page is still Hebrew, and a right-to-left passage laid out
            left-to-right is not a styling detail — it is unreadable.
          */
          dir={reading && reading.code !== siteLanguage ? (reading.rtl ? 'rtl' : 'ltr') : undefined}
        >
          {heading(tFlow('flow.s3.title'), tFlow('flow.s3.hint'), tFlow)}

          {error && (
            <p role="alert" className="mt-5 rounded-lg border-s-[3px] border-critical bg-critical/8 px-4 py-3.5 text-critical">
              {error}
            </p>
          )}

          {/*
            Wrapped only when there is something to override with. Handing the
            provider an empty catalogue would not be a no-op — `useMessages`
            falls back to the English constant, not to the language above it —
            so the pre-review would drop to English whenever the reading
            language and the site's agreed. Which is almost always.
          */}
          <InReadingLanguage catalogue={flowCatalogue}>
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
                path: entry.path,
                grant: entry.grant,
                expiresAt: entry.expiresAt,
                translations: readings[entry.id] ?? null,
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
              languages={languages}
              readingLanguage={reading?.code ?? null}
            />
          </div>
          </InReadingLanguage>

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
 * What a person looks at while the model reads their file.
 *
 * The only sign it was working used to be a 17px spinner inside the button,
 * and a reading takes between eight and thirty seconds — long enough, on a
 * phone at a conference, for somebody to decide the page has frozen and press
 * it again. So this takes the screen: the Center's own mark, turning, over the
 * name of the file it is actually looking at.
 *
 * ── the counter is there to be believed ─────────────────────────────────────
 *
 * A spinner alone is what a hung page looks like too. A number that keeps
 * moving cannot be mistaken for one, and it costs nothing to be honest with:
 * it is elapsed time, which the archive knows, rather than a percentage, which
 * it does not — the model does not report progress and inventing a bar that
 * creeps to 90% and waits is the kind of thing this project does not do.
 *
 * After twenty seconds it says so plainly rather than going quiet, because by
 * then the question in the room is whether anything is happening at all.
 */
function Thinking({
  mark,
  fileName,
  progress,
}: {
  mark: React.ReactNode;
  fileName: string | null;
  progress: { done: number; total: number } | null;
}) {
  const t = useMessages();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(
      () => setSeconds(Math.round((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center rounded-xl border border-rule bg-paper-2/40 px-6 py-14 text-center"
    >
      <span className="animate-turning block">{mark}</span>

      <p className="mt-6 font-display text-xl sm:text-2xl">{t('flow.analysing')}</p>

      {fileName && (
        <p className="machine mt-1.5 max-w-full truncate text-sm text-muted">{fileName}</p>
      )}

      {progress && progress.total > 1 && (
        <p className="eyebrow mt-2 text-[0.75rem]">
          {progress.done + 1} / {progress.total}
        </p>
      )}

      <p className="machine mt-4 text-sm text-muted" aria-hidden>
        {seconds}s
      </p>

      {seconds >= 20 && (
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
          {t('flow.stillReading')}
        </p>
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

  /*
   * Two controls, two labels — and that is the whole point of this shape.
   *
   * The field and its "I don't know" used to live inside one <label>. A label
   * binds to the first labelable thing inside it, so tapping the words "I
   * don't know" did not tick the box: it focused the text field above. The
   * only way to set it was to hit the 18px square exactly, which on a phone is
   * most of the way to impossible and is the wrong answer for an audience the
   * archive describes as families with a shoebox.
   *
   * Now each control owns its own label, and the checkbox's covers its words.
   */
  return (
    <div>
      <label htmlFor={`field-${id}`} className="eyebrow mb-2 block text-[0.82rem]">
        {label}
      </label>
      <input
        id={`field-${id}`}
        value={unknown ? '' : value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || unknown}
        placeholder={unknown ? '' : placeholder}
        maxLength={200}
        dir="auto"
        className="h-14 w-full rounded-lg border border-rule bg-paper px-4 text-[1.05rem] focus:border-accent-strong focus:outline-none disabled:bg-paper-2 disabled:text-muted"
      />
      {/* The whole row is the target, not the square. */}
      <label
        htmlFor={`unknown-${id}`}
        className="mt-1.5 flex min-h-11 cursor-pointer items-center gap-2 text-[0.95rem] text-muted"
      >
        <input
          id={`unknown-${id}`}
          type="checkbox"
          checked={unknown}
          disabled={disabled}
          onChange={(e) => {
            setDontKnow({ ...dontKnow, [id]: e.target.checked });
            if (e.target.checked) onChange('');
          }}
          className="h-5 w-5 rounded border-rule-strong accent-[var(--color-accent-strong)]"
        />
        {t('flow.dontKnow')}
      </label>
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
 * The subtree in one language, or exactly as it was.
 *
 * `MessagesProvider` with an empty catalogue is not neutral — a missing key
 * falls through to the English constant rather than to whatever provider sits
 * above — so "no override" has to mean no provider at all, not an empty one.
 */
function InReadingLanguage({
  catalogue,
  children,
}: {
  catalogue: Record<string, string> | null;
  children: React.ReactNode;
}) {
  if (!catalogue) return <>{children}</>;
  return <MessagesProvider catalogue={catalogue}>{children}</MessagesProvider>;
}
