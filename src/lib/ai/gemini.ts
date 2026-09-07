import { GoogleGenAI, Type } from '@google/genai';
import { GEMINI_FALLBACK_MODELS, GEMINI_MODEL, geminiApiKey } from '@/lib/env';
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
): Promise<{ response: Awaited<ReturnType<GoogleGenAI['models']['generateContent']>>; model: string }> {
  const models = [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== GEMINI_MODEL)];
  let lastError: unknown = null;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return { response: await client.models.generateContent(request(model)), model };
      } catch (error) {
        const status = (error as { status?: number })?.status;
        const message = String((error as { message?: string })?.message ?? '');

        if (status === 429 || /RESOURCE_EXHAUSTED/.test(message)) {
          lastError = error;
          break; // this model is out for the day; the next one is not
        }
        if (status === 503 || /UNAVAILABLE/.test(message)) {
          if (attempt === 0) {
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

      const { response, model: usedModel } = await withFallback(client, (model) => ({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: input.mimeType, data: toBase64(input.bytes) } },
              // Contributor text only. The rules live in systemInstruction, in
              // a turn nobody outside this codebase can write into.
              { text: buildContributorNote(input.title, input.fileName, input.known, input.language) },
            ],
          },
        ],
        config: {
          systemInstruction: buildInstructions(vocabulary),
          responseMimeType: 'application/json',
          responseSchema: responseSchema(allowed),
          temperature: 0.2,
        },
      }));

      const text = response.text;
      if (!text) throw new Error('Gemini returned an empty response.');

      const parsed = JSON.parse(text) as Record<string, unknown>;

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
        raw: parsed,
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
