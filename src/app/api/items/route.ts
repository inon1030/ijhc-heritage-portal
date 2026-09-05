import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, invalid, ok, readJson, unexpected } from '@/lib/api';
import { verifyGrant } from '@/lib/files/grant';
import { receiptFor } from '@/lib/items/receipt';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { FIELD_KEYS, isValidValue } from '@/lib/fields/registry';
import { SUGGESTION_THRESHOLD } from '@/lib/fields/suggestions';
import { createItem } from '@/lib/items/mutations';
import { CATEGORIES, COMMUNITIES } from '@/lib/types';

const Analysis = z.object({
  provider: z.string(),
  model: z.string(),
  summary: z.string(),
  keywords: z.array(z.string()),
  language: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  ocrText: z.string().nullable(),
  transcript: z.string().nullable(),
  suggestedCategory: z.enum(CATEGORIES as [string, ...string[]]).nullable().optional(),
  suggestedCommunity: z.enum(COMMUNITIES as [string, ...string[]]).nullable(),
  offTopic: z.boolean().optional(),
  offTopicReason: z.string().max(400).nullable().optional(),
  suggestedPeriod: z.string().max(120).nullable(),
  suggestedOrigin: z.string().max(200).nullable(),
  reasoning: z.string().max(2000).nullable(),
  evidence: z
    .record(
      z.string(),
      z.object({ basis: z.enum(['read', 'inferred', 'guess']), note: z.string().max(400).nullable() }),
    )
    .nullable()
    .optional(),
  /**
   * The gated tree fields, as they came back from /api/analyze.
   *
   * The gate has already run server-side. This re-checks the threshold anyway,
   * because between there and here the values pass through a browser: the
   * analyse response is handed to the client and posted back, so a crafted
   * request could otherwise plant a 0.2 guess in a volunteer's queue wearing
   * the archive's own colours. Same reason the enum is the registry's key list.
   */
  fields: z
    .array(
      z.object({
        key: z.enum(FIELD_KEYS as [string, ...string[]]),
        value: z.string().trim().min(1).max(2000),
        confidence: z.number().min(SUGGESTION_THRESHOLD).max(1),
        basis: z.enum(['read', 'inferred', 'guess']),
        note: z.string().max(400).nullable(),
      }),
    )
    .max(FIELD_KEYS.length)
    .optional(),
  raw: z.unknown(),
});

const Body = z.object({
  title: z.string().trim().min(1).max(200),
  source: z.string().trim().max(200).nullable().optional(),
  /** Written by the client from what /api/links/ingest returned, never typed. */
  sourceUrl: z.string().url().max(2000).nullable().optional(),
  /**
   * Unverified and deliberately so. It grants nothing, nothing is ever
   * retrieved by typing it, and it exists only so a volunteer can come back
   * with a question.
   */
  contributorEmail: z.string().trim().email().max(160).nullable().optional(),
  contributorFullName: z.string().trim().min(2).max(120).nullable().optional(),
  /**
   * Which wording the contributor was shown. Required: a submission that
   * cannot say what its sender agreed to is a submission nobody can answer a
   * question about later.
   */
  consentVersion: z.string().trim().min(1).max(40),
  contributorDescription: z.string().trim().max(4000).nullable().optional(),
  contributorKeywords: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  /**
   * The catalogue fields as the contributor left the pre-review — the machine's
   * findings they kept, the ones they corrected, and any they added.
   *
   * `community` and its five siblings are allowed here, and that is safe
   * because of where they land rather than because of what is checked: a
   * contributor's value becomes a row in `item_fields` marked `contributor`,
   * which a volunteer reads and may adopt. It never reaches `items`, so it
   * never decides what the portal files the record under. See writeFields.
   */
  contributorFields: z
    .array(z.object({ key: z.enum(FIELD_KEYS as [string, ...string[]]), value: z.string().trim().min(1).max(2000) }))
    .max(FIELD_KEYS.length)
    .refine((fields) => fields.every((f) => isValidValue(f.key, f.value)), {
      message: 'A value is not one that field takes.',
    })
    .optional(),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(400),
        /** Proof the path was minted for this caller. See src/lib/files/grant.ts. */
        grant: z.string().min(1).max(200),
        expiresAt: z.number(),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(120),
        byteSize: z.number().int().positive(),
        width: z.number().int().positive().nullable().optional(),
        height: z.number().int().positive().nullable().optional(),
        durationMs: z.number().int().positive().nullable().optional(),
        previewPath: z.string().max(500).nullable().optional(),
        analysis: Analysis.nullable(),
        analysisError: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(25),
});

/** Anyone may submit. Everything lands as pending, no exceptions. */
export async function POST(request: NextRequest) {
  try {
    // Anonymous contribution is a product requirement; unlimited anonymous row
    // creation is not. Ten submissions in ten minutes is far more than a person
    // makes and far less than a script wants.
    const limit = rateLimit(`submit:${clientKey(request)}`, { limit: 10, windowMs: 10 * 60_000 });
    if (!limit.allowed) {
      return fail(429, 'rate_limited', `Too many submissions. Try again in ${limit.retryAfterSeconds} seconds.`);
    }

    const parsed = Body.safeParse(await readJson(request));
    if (!parsed.success) return invalid(parsed.error);

    const body = parsed.data;

    /*
     * Every file must be one this caller was given.
     *
     * Without it a submission could name another record's storage path, and if
     * a volunteer published that submission, the other record's file became
     * public with it.
     */
    const ungranted = body.files.find((file) => !verifyGrant(file.path, file.expiresAt, file.grant));
    if (ungranted) {
      return fail(403, 'forbidden', 'One of those uploads was not created here, or it has expired.');
    }
    const item = await createItem({
      title: body.title,
      source: body.source?.trim() || null,
      sourceUrl: body.sourceUrl?.trim() || null,
      contributorEmail: body.contributorEmail?.trim() || null,
      contributorFullName: body.contributorFullName?.trim() || null,
      consentVersion: body.consentVersion,
      contributorDescription: body.contributorDescription?.trim() || null,
      contributorKeywords: body.contributorKeywords ?? [],
      contributorFields: body.contributorFields ?? null,
      files: body.files.map((file) => ({
        storagePath: file.path,
        fileName: file.fileName,
        mimeType: file.mimeType,
        byteSize: file.byteSize,
        width: file.width ?? null,
        height: file.height ?? null,
        durationMs: file.durationMs ?? null,
        previewPath: file.previewPath ?? null,
        analysis: file.analysis as never,
        analysisError: file.analysisError ?? null,
      })),
    });

    // The contributor's way back to this submission. Handed over on screen
    // rather than emailed, so it costs nothing and needs no address.
    return ok({ id: item.id, receipt: receiptFor(item.id) }, { status: 201 });
  } catch (error) {
    return unexpected(error);
  }
}
