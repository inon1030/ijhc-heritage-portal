import { createPartFromUri, FileState, GoogleGenAI, Type, type Part } from '@google/genai';
import { GEMINI_FALLBACK_MODELS, GEMINI_MODEL, GEMINI_WEB_SEARCH, geminiApiKey } from '@/lib/env';
import { cleanSources, type BackgroundSource } from './background';
import { MODEL_FIELDS, fieldDef } from '@/lib/fields/registry';
import { communityOrCatchAll } from './community';
import {
  gateSuggestions,
  ledgerFrom,
  suggestionFor,
  type FieldSuggestion,
} from '@/lib/fields/suggestions';
import { CATEGORIES, type ItemCategory } from '@/lib/types';
import { buildContributorNote, buildInstructions } from './prompt';
import type { AIProvider, AnalysisInput, AnalysisResult } from './types';

/**
 * One engine for every AI operation in the product: multilingual OCR, image
 * understanding, native PDF reading, and audio transcription all come from a
 * single `generateContent` call.
 *
 * The response schema used to carry three overlapping things — a set of
 * `suggested*` values, a separate evidence ledger keyed by field, and a single
 * overall confidence. They were the same knowledge written down three times,
 * and nothing made them agree: the model could suggest a community, omit it
 * from the ledger, and report 0.95 for the item as a whole.
 *
 * Now it returns one array. Each entry is a field of the logical tree with its
 * value, its basis, the clause it rests on, and its own confidence. The ledger
 * and the four column-backed suggestions are derived from that array here, so
 * they cannot drift from it.
 *
 * To move to a different vendor later, add a sibling file implementing
 * AIProvider and change AI_PROVIDER. Nothing outside src/lib/ai needs to know.
 */

/**
 * The response shape, built per request because the allowed subject terms are
 * data rather than code.
 *
 * `keywords` is an **enum** of the archive's own terms, not a description
 * asking for them. The distinction is the whole point: a description is a
 * request the model may reasonably reinterpret, and an enum is a shape it
 * cannot return outside of. `fields.key` has worked this way since the tree
 * arrived; subject terms were the one place still taking free text, which is
 * why eight files produced thirty-six queued candidates.
 *
 * It falls back to free text when the vocabulary is empty — a fresh archive
 * with no terms yet would otherwise be unable to return any keyword at all,
 * and an empty enum is not a valid schema.
 */
function responseSchema(allowed: string[]) {
  return {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: 'Two sentences on what this item contains.' },
    keywords: {
      type: Type.ARRAY,
      items: allowed.length ? { type: Type.STRING, enum: allowed } : { type: Type.STRING },
      description: allowed.length
        ? 'Subject terms from the list you were given, in the spelling shown. Only what the material supports.'
        : 'About five subject concepts.',
    },
    newTerms: {
      type: Type.ARRAY,
      description:
        'Subject words the material needs that the list does not hold. Each names the branch it subdivides. Leave empty when the list was enough.',
      items: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          branchKey: { type: Type.STRING, enum: MODEL_FIELDS.map((f) => f.key) },
        },
        required: ['term', 'branchKey'],
      },
    },
    ocrText: {
      type: Type.STRING,
      nullable: true,
      description: 'Verbatim text in its original script.',
    },
    transcript: { type: Type.STRING, nullable: true, description: 'Speech transcription.' },
    background: {
      type: Type.STRING,
      nullable: true,
      description:
        'A general description in the manner of a Deep Research briefing: short "## " headings (what this is, period, community and place, historical context, worth finding out), a paragraph under each, about 200 to 350 words. May draw on web search. Unverified by definition; never repeated as a field.',
    },
    belongsToArchive: {
      type: Type.BOOLEAN,
      description:
        'Whether this is plausibly material of Indian Jewish heritage. Answer false only when you are confident it is not. When in doubt, true.',
    },
    doesNotBelongBecause: {
      type: Type.STRING,
      nullable: true,
      description:
        'Only when belongsToArchive is false. One clause naming what places it elsewhere.',
    },
    fields: {
      type: Type.ARRAY,
      description:
        'One entry per catalogue field the material actually supports. Omit a field rather than filling it weakly.',
      items: {
        type: Type.OBJECT,
        properties: {
          // The enum is the tree, less the branches the file itself answers.
          // A model cannot invent a branch, and a branch removed from the
          // registry stops being offered on the very next request.
          key: { type: Type.STRING, enum: MODEL_FIELDS.map((f) => f.key) },
          value: { type: Type.STRING },
          basis: { type: Type.STRING, enum: ['read', 'inferred', 'guess'] },
          note: {
            type: Type.STRING,
            nullable: true,
            description: 'One short clause naming the thing you looked at.',
          },
          confidence: { type: Type.NUMBER, description: 'Between 0 and 1, calibrated as instructed.' },
        },
        required: ['key', 'value', 'basis', 'confidence'],
      },
    },
  },
    required: ['summary', 'keywords', 'fields'],
  } as const;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/**
 * Where a file stops fitting in the request that asks about it.
 *
 * `generateContent` takes at most 20 MB of request, and base64 costs a third
 * on top of the bytes — so 12 MB of file is about 16 MB of request, which
 * leaves room for the prompt and the archive's subject list.
 *
 * **This is the line an hour-long recording was falling over.** The upload cap
 * is 50 MB and an m4a interview reaches that at around fifty minutes, so every
 * oral history longer than roughly a quarter of an hour was posted, stored,
 * charged for and then refused by the model — and the contributor was told the
 * analysis service had not responded, which was true and useless. Above the
 * line the bytes go to the Files API and the request carries a reference.
 */
const INLINE_LIMIT_BYTES = 12 * 1024 * 1024;

/** How long to wait for Google to finish ingesting a large upload. */
const FILE_READY_MS = 20_000;

/**
 * The file, in whatever form this request can carry it.
 *
 * Small things go inline, which is one round trip and no state anywhere.
 * Large things are uploaded first and referenced — the same model, the same
 * prompt, the same answer, just a request that is a kilobyte instead of sixty
 * megabytes.
 *
 * A large upload is **not** left behind afterwards: it would sit in Google's
 * file store for forty-eight hours, and this is family material that has not
 * been published, has not been reviewed, and in most cases has not yet been
 * submitted. See `discard`.
 */
async function sourcePart(
  client: GoogleGenAI,
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ part: Part; uploaded: string | null }> {
  if (bytes.byteLength <= INLINE_LIMIT_BYTES) {
    return { part: { inlineData: { mimeType, data: toBase64(bytes) } }, uploaded: null };
  }

  const file = await client.files.upload({
    file: new Blob([new Uint8Array(bytes)], { type: mimeType }),
    config: { mimeType },
  });

  /*
   * Audio and video are transcoded on arrival, and a file that is still
   * PROCESSING cannot be referenced — the request fails with a 400 that names
   * the state. So this waits for ACTIVE rather than assuming it, and gives up
   * with a sentence a person can act on rather than with Google's.
   */
  const ready = await waitForFile(client, file);
  if (!ready.uri) throw new Error('The recording could not be prepared for reading. Try again.');

  return {
    part: createPartFromUri(ready.uri, ready.mimeType ?? mimeType),
    uploaded: file.name ?? null,
  };
}

async function waitForFile(
  client: GoogleGenAI,
  file: { name?: string; state?: FileState; uri?: string; mimeType?: string },
): Promise<{ uri?: string; mimeType?: string }> {
  /*
   * Seeded with the upload's own answer, not with its state alone.
   *
   * A small upload comes back ACTIVE and complete, and re-fetching it to learn
   * what it already told us is a round trip for nothing. The first version
   * carried the state across and dropped the `uri` beside it, which made every
   * already-active upload fail as "could not be prepared" — a value lost in the
   * handoff, reported as a fault in the file.
   */
  let current = file;
  const until = Date.now() + FILE_READY_MS;

  while (current.state === FileState.PROCESSING || current.state === undefined) {
    if (Date.now() > until) throw new Error('That recording is taking too long to prepare. Try a shorter one.');
    await new Promise((r) => setTimeout(r, 1_000));
    current = await client.files.get({ name: file.name ?? '' });
  }

  if (current.state === FileState.FAILED) {
    throw new Error('That recording could not be read. It may be damaged or in an unsupported codec.');
  }
  return current;
}

/**
 * Take the copy back out of Google's file store once the reading is done.
 *
 * Failing to delete is not worth losing an analysis over — the file expires on
 * its own in forty-eight hours — so this never throws. It is logged, because a
 * deletion that quietly stops working is a retention promise that quietly
 * stops being true.
 */
async function discard(client: GoogleGenAI, name: string | null): Promise<void> {
  if (!name) return;
  try {
    await client.files.delete({ name });
  } catch (cause) {
    console.error('[gemini] could not remove the uploaded copy', name, cause);
  }
}

/**
 * The pages web search actually used, from the response's grounding record.
 *
 * Taken from the metadata rather than asked of the model: a model asked to
 * list its sources writes plausible addresses, and the grounding record is the
 * list of what was fetched.
 */
function groundingSources(
  response: Awaited<ReturnType<GoogleGenAI['models']['generateContent']>>,
): BackgroundSource[] {
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  return cleanSources(chunks.map((chunk) => ({ title: chunk.web?.title, url: chunk.web?.uri })));
}

/**
 * Search is a bonus on top of the reading, never a condition of it.
 *
 * Measured on 21.09.2026 on the free tier: the same photograph, the same
 * model, answered normally without search and **429 on every model in the
 * chain** with it. Had search been wired into the fallback chain, every upload
 * in the archive would have failed from that moment on.
 *
 * So search is asked once, of the preferred model only. Any refusal — the
 * allowance, a model that will not combine search with a schema (400), a busy
 * or withdrawn model — drops to the ordinary chain without search, and the
 * background is written from what the model already knows. A quota or a
 * capability refusal also switches search off in this server for an hour, so
 * the next forty uploads do not each spend a round trip hearing the same no.
 */
const SEARCH_PAUSE_MS = 60 * 60_000;

/**
 * How long the search attempt may take before the reading goes on without it.
 * A contributor is watching a spinner; background is not worth minutes.
 */
const SEARCH_TIMEOUT_MS = 45_000;

/**
 * The reading's own clock, when the caller does not give one.
 *
 * Search could take forty-five seconds and then hand over to an ordinary
 * reading with no limit at all, retried by the SDK five times. The route has
 * sixty. Past that the platform kills it, and the contributor sees
 * "Unexpected token 'A' … is not valid JSON" instead of their upload
 * (22.09.2026). Everything below now runs against one deadline.
 */
const DEFAULT_BUDGET_MS = 50_000;

/**
 * What the ordinary reading is guaranteed after search gives up.
 *
 * Search is the optional half. It gets whatever is left over this, so a slow
 * search costs the background section and never the reading itself.
 */
const PLAIN_READ_RESERVE_MS = 20_000;

/** The error a spent deadline raises, named like the SDK's own timeout. */
function outOfTime(): Error {
  return Object.assign(new Error('The reading ran out of time.'), { name: 'TimeoutError' });
}
let searchPausedUntil = 0;

function searchWorthPausing(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  const message = String((error as { message?: string })?.message ?? '');
  if (status === 429 || /RESOURCE_EXHAUSTED/.test(message)) return true;
  return (
    (status === 400 || /INVALID_ARGUMENT/.test(message)) &&
    /tool|search|grounding|response_?schema|response_?mime|controlled generation/i.test(message)
  );
}

function searchMayGiveWay(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  const message = String((error as { message?: string })?.message ?? '');
  const name = (error as { name?: string })?.name ?? '';
  return (
    searchWorthPausing(error) ||
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    status === 503 ||
    status === 404 ||
    /UNAVAILABLE|NOT_FOUND|no longer available/i.test(message)
  );
}

/** For the tests: forget a pause, as a fresh server would. */
export function resetSearchPause(): void {
  searchPausedUntil = 0;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** A surviving suggestion's value, or null. Used for the column-backed fields. */
function valueOf(suggestions: FieldSuggestion[], key: string): string | null {
  return suggestionFor(suggestions, key)?.value ?? null;
}

/**
 * The record's own confidence: the weakest thing that got through the gate.
 *
 * Kept for triage lists and never shown in the portal. The minimum rather than
 * the mean, because a record is worth as much scrutiny as its shakiest accepted
 * field. Zero when nothing cleared the gate at all, which is a useful sort key
 * — those are the records where the machine helped least.
 */
function floorConfidence(suggestions: FieldSuggestion[]): number {
  if (!suggestions.length) return 0;
  return Math.min(...suggestions.map((s) => s.confidence));
}

/**
 * Ask the preferred model; on a *quota* refusal, ask the next one.
 *
 * ── 429 and 503 are not the same failure, and neither is a bug here ─────────
 *
 * **429** is the day's allowance for that model, gone. It will still be gone in
 * a second and in a minute, so retrying the same model is calls spent hearing
 * the same answer — but the allowance is **per model**, so the next model has
 * its own and answering with it costs nothing.
 *
 * **503** is "high demand": a queue, which a moment clears. Seen on production
 * within three minutes of the 429s on 06.09.2026. That one is worth one short
 * wait on the same model before moving on, because the preferred model is
 * preferred for a reason.
 *
 * Anything else — a malformed request, a bad key, a file the model refuses —
 * is not something a different model fixes, so it is thrown straight out. A
 * fallback that swallowed real errors would turn one broken upload into three
 * wasted calls and the same failure.
 */
async function withFallback(
  client: GoogleGenAI,
  request: (model: string) => Parameters<GoogleGenAI['models']['generateContent']>[0],
  deadline: number,
): Promise<{ response: Awaited<ReturnType<GoogleGenAI['models']['generateContent']>>; model: string }> {
  const models = [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== GEMINI_MODEL)];
  let lastError: unknown = null;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const left = deadline - Date.now();
      if (left <= 0) throw outOfTime();
      try {
        const asked = request(model);
        const response = await client.models.generateContent({
          ...asked,
          config: {
            ...asked.config,
            // Each call stops when the reading's time does, and the SDK does
            // not retry behind this loop's back: this loop is the retry.
            abortSignal: AbortSignal.timeout(left),
            httpOptions: { retryOptions: { attempts: 1 } },
          },
        });
        return { response, model };
      } catch (error) {
        const status = (error as { status?: number })?.status;
        const message = String((error as { message?: string })?.message ?? '');

        if (status === 429 || /RESOURCE_EXHAUSTED/.test(message)) {
          lastError = error;
          break; // this model is out for the day; the next one is not
        }
        /*
         * The model is gone. Ask the next one.
         *
         * Measured today, and not hypothetically: `gemini-2.5-flash` and
         * `gemini-2.5-flash-lite` are still listed by `models.list` and answer
         * `generateContent` with **404 — no longer available**. A name in this
         * chain is a name Google can withdraw between one deploy and the next.
         *
         * Until now that threw, because it is neither 429 nor 503 — so the day
         * the preferred model is retired, every upload in the archive fails
         * with a 404 while six other models sit there answering. That is the
         * exact shape of the 503 bug this function already carries a paragraph
         * about, and it deserved the same fix rather than a second outage.
         */
        if (status === 404 || /NOT_FOUND|no longer available|is not found/i.test(message)) {
          console.error(`[gemini] ${model} is gone; moving to the next model`, message);
          lastError = error;
          break;
        }
        if (status === 503 || /UNAVAILABLE/.test(message)) {
          if (attempt === 0 && deadline - Date.now() > 900) {
            await new Promise((r) => setTimeout(r, 900));
            continue; // a queue a moment may clear
          }
          /*
           * Still busy after the retry: move on, do not give up.
           *
           * This used to fall through to the throw below, so a model answering
           * 503 ended the whole attempt and the other three were never asked.
           * Measured live: every upload failed with "the analysis service did
           * not respond" while three models were sitting there answering.
           * Busy is exactly the case the chain exists for.
           */
          lastError = error;
          break;
        }
        throw error;
      }
    }
  }

  throw lastError ?? new Error('No model was able to answer.');
}

export function createGeminiProvider(): AIProvider {
  const client = new GoogleGenAI({ apiKey: geminiApiKey() });

  return {
    id: 'gemini',
    model: GEMINI_MODEL,
    isSimulated: false,

    async analyze(input: AnalysisInput): Promise<AnalysisResult> {
      /*
       * The archive's own subject list, in the prompt and in the schema.
       *
       * Both, not either: the prompt explains what the list is for and how a
       * proposal works, and the enum makes returning something outside it
       * impossible rather than discouraged. Variants are offered to the enum
       * too — the model may well read `Bombay` off an imprint — and resolve to
       * the preferred spelling when the record is saved.
       */
      const vocabulary = input.vocabulary ?? [];
      const allowed = [
        ...new Set(
          vocabulary.flatMap((branch) => branch.terms.flatMap((t) => [t.term, ...t.variants])),
        ),
      ];

      /*
       * Inline for a photograph, a reference for a two-hour interview.
       *
       * Resolved once and reused across the whole fallback chain: three models
       * asking about the same recording must not mean three uploads of it.
       */
      const source = await sourcePart(client, input.bytes, input.mimeType);

      const request = (model: string, search: boolean) => ({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              source.part,
              // Contributor text only. The rules live in systemInstruction, in
              // a turn nobody outside this codebase can write into.
              { text: buildContributorNote(input.title, input.fileName, input.known) },
            ],
          },
        ],
        config: {
          systemInstruction: buildInstructions(vocabulary, input.language),
          responseMimeType: 'application/json',
          responseSchema: responseSchema(allowed),
          temperature: 0.2,
          // Search feeds `background` only; the instructions forbid it from
          // counting as having read anything. See background.ts.
          ...(search ? { tools: [{ googleSearch: {} }] } : {}),
        },
      });

      const deadline = input.deadline ?? Date.now() + DEFAULT_BUDGET_MS;

      const read = async () => {
        const searchTime = Math.min(SEARCH_TIMEOUT_MS, deadline - Date.now() - PLAIN_READ_RESERVE_MS);
        if (GEMINI_WEB_SEARCH && Date.now() >= searchPausedUntil && searchTime > 0) {
          try {
            const asked = request(GEMINI_MODEL, true);
            const response = await client.models.generateContent({
              ...asked,
              config: {
                ...asked.config,
                abortSignal: AbortSignal.timeout(searchTime),
                // The SDK retries a refusal five times with a back-off by
                // default. Measured: that turned one search 429 into most of a
                // 158-second upload. One answer is enough to know.
                httpOptions: { retryOptions: { attempts: 1 } },
              },
            });
            return { response, model: GEMINI_MODEL };
          } catch (error) {
            if (!searchMayGiveWay(error)) throw error;
            if (searchWorthPausing(error)) searchPausedUntil = Date.now() + SEARCH_PAUSE_MS;
            console.warn('[gemini] reading without search:', String((error as Error)?.message ?? error).slice(0, 200));
          }
        }
        return withFallback(client, (model) => request(model, false), deadline);
      };

      const { response, model: usedModel } = await read().finally(() => discard(client, source.uploaded));

      const text = response.text;
      if (!text) throw new Error('Gemini returned an empty response.');

      /*
       * A reading that ran out of room is a broken reading, and it has to say so.
       *
       * The response is schema-constrained JSON, so a transcript that fills the
       * output budget does not come back short — it comes back as JSON with no
       * closing brace, and `JSON.parse` throws a SyntaxError three lines below
       * that reaches the contributor as an internal error. This is the same
       * shape as every other fault this file guards against: work that failed
       * while reporting something other than failure.
       */
      if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        throw new Error(
          'The reading was longer than one answer can hold. A recording this long has to be split before the archive can transcribe it.',
        );
      }

      const parsed = JSON.parse(text) as Record<string, unknown>;
      const backgroundSources = groundingSources(response);
      const background = nonEmpty(parsed.background);

      // The single gate. Everything below 70% — and every guess, whatever it
      // claimed — stops here and is never stored, rendered, or counted.
      const fields = gateSuggestions(parsed.fields);

      const category = valueOf(fields, 'category');
      const community = valueOf(fields, 'community');

      /*
       * The default is that it belongs.
       *
       * A missing or malformed answer must not shunt a record into the
       * unrelated group: that group exists to be rejected from, and the cost of
       * wrongly putting a family photograph there is far higher than the cost
       * of a holiday snap sitting in the ordinary queue for one extra minute.
       * Only an explicit `false` counts.
       */
      const offTopic = parsed.belongsToArchive === false;

      return {
        provider: 'gemini',
        // The model that actually answered, not the one that was asked first.
        // `ai_analyses.model` is how a volunteer knows what read their record,
        // and recording the preferred model after the fallback did the work
        // would make the archive wrong about its own provenance.
        model: usedModel,
        summary: nonEmpty(parsed.summary) ?? '',
        newTerms: Array.isArray(parsed.newTerms)
          ? (parsed.newTerms as { term?: unknown; branchKey?: unknown }[])
              .map((row) => ({
                term: nonEmpty(row.term) ?? '',
                branchKey: nonEmpty(row.branchKey) ?? '',
              }))
              .filter((row) => row.term && row.branchKey)
          : [],
        keywords: Array.isArray(parsed.keywords)
          ? parsed.keywords
              .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
              .slice(0, 8)
          : [],
        fields,
        confidence: floorConfidence(fields),
        ocrText: nonEmpty(parsed.ocrText),
        transcript: nonEmpty(parsed.transcript),
        background,
        backgroundSources,

        // Views of `fields`. The registry says these six have columns; the gate
        // has already decided whether they are offered at all.
        suggestedCategory: (CATEGORIES as string[]).includes(category ?? '')
          ? (category as ItemCategory)
          : null,
        // General India when it is India's and unplaceable; null when it is not
        // the archive's material at all. Two shelves — see communityOrCatchAll.
        suggestedCommunity: communityOrCatchAll(community, offTopic),
        offTopic,
        offTopicReason: offTopic ? nonEmpty(parsed.doesNotBelongBecause) : null,
        suggestedPeriod: valueOf(fields, 'period'),
        suggestedOrigin: valueOf(fields, 'origin_place'),
        language: valueOf(fields, 'language'),

        // Prose for the reviewer, assembled from what survived rather than
        // asked for separately — the model narrating its reasoning in free text
        // was the part most likely to describe a field it had not returned.
        reasoning: reasoningFrom(fields),
        evidence: ledgerFrom(fields),
        // The sources ride in the stored answer, beside the background they
        // belong to — that is where the workbench reads both from.
        raw: { ...parsed, backgroundSources },
      };
    },
  };
}

/** One sentence naming the readings the record leans on. Null when there are none. */
function reasoningFrom(fields: FieldSuggestion[]): string | null {
  const grounded = fields.filter((f) => f.note && f.basis !== 'guess');
  if (!grounded.length) return null;

  return grounded
    .slice(0, 4)
    .map((f) => `${fieldDef(f.key)?.label ?? f.key}: ${f.note}`)
    .join('; ');
}
