import 'server-only';
import { getAIProvider } from '@/lib/ai';
import { resolveMimeType } from '@/lib/files/detect';
import { readImageDimensions } from '@/lib/files/dimensions';
import { makeRendition, needsRendition, renditionPath } from '@/lib/files/rendition';
import { fieldDef, isValidValue } from '@/lib/fields/registry';
import { mediaFacetFrom } from '@/lib/fields/suggestions';
import { describeThrown, problemCode } from '@/lib/problems/code';
import { recordProblem } from '@/lib/problems/record';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { loadVocabulary } from '@/lib/vocabulary/load';
import { recordCandidates } from '@/lib/vocabulary/mutations';

/**
 * Reading an item that was sent on before its reading finished (0032).
 *
 * Inon, 25.09.2026: when the machine takes longer than fifty seconds the
 * contributor may send the item straight to a Knowledge Expert, skipping the
 * pre-review, and let the reading go on by itself. This is "by itself". It
 * runs on the server after the item is saved, reads each file the way
 * /api/analyze does, and finishes the `ai_analyses` row the item was saved
 * with as `pending`.
 *
 * The rules do not change because nobody is watching: the output goes to
 * `ai_analyses` and to `ai` rows in `item_fields`, never to `items` (rule 1);
 * the 70% gate has already run inside the provider; and a proposal a person
 * made first is never overwritten — the insert skips any field that already
 * has a row.
 */

export interface PendingFile {
  fileId: string;
  storagePath: string;
  fileName: string;
}

export interface PendingReading {
  itemId: string;
  title: string;
  known?: string;
  language?: string;
  files: PendingFile[];
}

/** Five minutes is the platform's limit for the route that calls this; keep a margin. */
export const BACKGROUND_BUDGET_MS = 280_000;

export async function readInBackground(job: PendingReading, startedAt = Date.now()): Promise<void> {
  const admin = createAdminSupabase();
  const provider = getAIProvider();
  const vocabulary = await loadVocabulary().catch(() => []);
  const deadline = startedAt + BACKGROUND_BUDGET_MS;
  let firstCommunity: string | null = null;

  for (const file of job.files) {
    try {
      const { data: blob, error } = await admin.storage.from('heritage').download(file.storagePath);
      if (error || !blob) throw new Error(`The file was not found in storage: ${file.storagePath}`);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const mimeType = resolveMimeType(bytes, blob.type || 'application/octet-stream');

      // What the browser could not measure, measured now from the bytes.
      const measured: Record<string, unknown> = { mime_type: mimeType, byte_size: bytes.byteLength };
      const dimensions = readImageDimensions(bytes, mimeType);
      if (dimensions) Object.assign(measured, { width: dimensions.width, height: dimensions.height });

      if (needsRendition(mimeType)) {
        const rendition = await makeRendition(bytes);
        if (rendition) {
          const target = renditionPath(file.storagePath);
          const { error: up } = await admin.storage
            .from('heritage')
            .upload(target, rendition.bytes, { contentType: rendition.mimeType, upsert: true });
          if (!up) measured.preview_path = target;
          if (rendition.sourceWidth && rendition.sourceHeight && !dimensions) {
            Object.assign(measured, { width: rendition.sourceWidth, height: rendition.sourceHeight });
          }
        }
      }
      await admin.from('item_files').update(measured).eq('id', file.fileId);

      const analysis = await provider.analyze({
        bytes,
        mimeType,
        fileName: file.fileName,
        title: job.title,
        known: job.known,
        language: job.language,
        vocabulary,
        deadline,
      });
      const derived = mediaFacetFrom(mimeType);
      const fields = derived ? [...analysis.fields, derived] : analysis.fields;

      await admin
        .from('ai_analyses')
        .update({
          provider: analysis.provider,
          model: analysis.model,
          status: 'succeeded',
          error: null,
          summary: analysis.summary,
          keywords: analysis.keywords,
          language: analysis.language,
          confidence: analysis.confidence,
          ocr_text: analysis.ocrText,
          transcript: analysis.transcript,
          suggested_community: analysis.suggestedCommunity,
          suggested_period: analysis.suggestedPeriod,
          suggested_origin: analysis.suggestedOrigin,
          reasoning: analysis.reasoning,
          evidence: analysis.evidence,
          off_topic: analysis.offTopic,
          off_topic_reason: analysis.offTopicReason,
          raw: analysis.raw,
        })
        .eq('item_id', job.itemId)
        .eq('file_id', file.fileId);

      await writeMachineFields(job.itemId, fields);
      firstCommunity ??= analysis.suggestedCommunity ?? null;
      await recordCandidates(analysis.newTerms ?? [], (firstCommunity as never) ?? null, job.itemId, {
        offTopic: analysis.offTopic,
      });
    } catch (error) {
      const code = problemCode();
      const described = describeThrown(error);
      console.error('[background-reading]', job.itemId, file.fileId, error);
      await recordProblem({
        code,
        source: 'server',
        place: 'background reading',
        path: `/review/${job.itemId}`,
        message: described.message,
        detail: described.detail,
      });
      await admin
        .from('ai_analyses')
        .update({ status: 'failed', error: `The background reading failed (${code}).` })
        .eq('item_id', job.itemId)
        .eq('file_id', file.fileId);
    }
  }
}

/**
 * The machine's field suggestions, as `ai` proposals.
 *
 * Only the fields that do not own a column on `items` — those live in
 * `ai_analyses` already — and never over a row that exists: an earlier file
 * of the same record, or a person, got there first.
 */
async function writeMachineFields(
  itemId: string,
  fields: { key: string; value: string; confidence: number; basis: string; note: string | null }[],
): Promise<void> {
  const rows = fields
    .filter((f) => {
      const def = fieldDef(f.key);
      return def && !def.column && isValidValue(f.key, f.value.trim());
    })
    .map((f) => ({
      item_id: itemId,
      field_key: f.key,
      value: f.value.trim(),
      source: 'ai',
      confidence: f.confidence,
      basis: f.basis,
      note: f.note,
    }));
  if (!rows.length) return;
  const { error } = await createAdminSupabase()
    .from('item_fields')
    .upsert(rows, { onConflict: 'item_id,field_key', ignoreDuplicates: true });
  if (error) console.error('[background-reading] field insert failed', error);
}
