import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getMessages } from '@/lib/i18n';
import { fail, invalid, ok, readJson, unexpected } from '@/lib/api';
import { verifyGrant } from '@/lib/files/grant';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { QuotaExhausted } from '@/lib/translate/plan';
import { getLanguage, listLanguages } from '@/lib/translate/languages';
import {
  MAX_READING_CHARS,
  READING_BLOCKS,
  translateReading,
  translateReadingEverywhere,
} from '@/lib/translate/reading';

/**
 * The reading of a file, in a language the person who uploaded it reads.
 *
 * ── who this is for ─────────────────────────────────────────────────────────
 *
 * A contributor at pre-review is being asked one question: did the machine read
 * your document correctly? Somebody who brought a Malayalam letter and reads
 * only Malayalam cannot answer that about an English transcription of it, and
 * until now the archive asked them to anyway. This is the switch under the text
 * box, and nothing more.
 *
 * ── this endpoint spends money, so ──────────────────────────────────────────
 *
 * **It takes the same proof as /api/analyze.** The grant is an HMAC minted at
 * /api/uploads/sign over the path and its expiry, so a caller here has, at some
 * point in the last hour, gone through the upload flow. It is the strongest
 * claim available: at pre-review there is no record and no session — the
 * contributor is anonymous by design and always will be.
 *
 * **It is rate limited** on the same key as every other public endpoint, and
 * lower than the analyser: a language switch is a click, not a loop.
 *
 * **The text is capped.** Not to save money — to bound how long somebody is
 * made to wait, and to keep the request from becoming a general translation
 * service with a heritage archive attached.
 *
 * ── and it keeps nothing ────────────────────────────────────────────────────
 *
 * No row is written. There is no record yet to attach one to, the contributor
 * has not submitted, and the translation is a reading aid for the person on the
 * screen rather than a thing the archive holds. When the record is published,
 * `translateItem` makes and stores its translations on the archive's own terms
 * — after a knowledge expert has approved it, which is the rule this must not
 * quietly step around.
 */

const Body = z.object({
  /** The path this reading came from, and the proof it is the caller's. */
  path: z.string().min(1).max(400),
  grant: z.string().min(1).max(200),
  expiresAt: z.number(),
  /**
   * One language, or the several a screen wants in one call.
   *
   * `langs` is what the contribution screen asks for the moment a reading comes
   * back: one request while the contributor is still reading the summary, so
   * moving between languages afterwards costs nothing. `lang` is what a later
   * click asks for, when the batch was too long to make or dropped that one
   * language for being in the wrong script.
   *
   * The *caller* names the languages rather than the server assuming "every
   * one but the source". The reading is in whichever language the contributor
   * asked the machine to write in — often not the source — and translating it
   * into the language it is already in is a call spent to produce what is
   * already on the screen.
   */
  lang: z.string().min(2).max(12).optional(),
  langs: z.array(z.string().min(2).max(12)).min(1).max(12).optional(),
  /** What the material is in, as the analysis read it. A hint for the model. */
  sourceLanguage: z.string().max(80).nullish(),
  blocks: z
    .array(
      z.object({
        key: z.enum(READING_BLOCKS),
        text: z.string().min(1),
      }),
    )
    .min(1)
    .max(READING_BLOCKS.length),
});

/**
 * A contributor is watching this, and a browser gives up long before a
 * serverless function does. Fifty seconds against a sixty second ceiling, on
 * the same pattern as the record translator: the bound is handed down to the
 * model calls, so a chunk that starts inside it cannot run past it.
 */
const BUDGET_MS = 50_000;

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { t } = await getMessages();

  try {
    const limit = rateLimit(`reading:${clientKey(request)}`, { limit: 12, windowMs: 60_000 });
    if (!limit.allowed) {
      return fail(
        429,
        'rate_limited',
        t('err.tooManyTranslations', { seconds: limit.retryAfterSeconds }),
      );
    }

    const parsed = Body.safeParse(await readJson(request));
    if (!parsed.success) return invalid(parsed.error);

    if (!verifyGrant(parsed.data.path, parsed.data.expiresAt, parsed.data.grant)) {
      return fail(403, 'forbidden', t('err.uploadNotOurs'));
    }

    const total = parsed.data.blocks.reduce((sum, block) => sum + block.text.length, 0);
    if (total > MAX_READING_CHARS) {
      return fail(
        413,
        'too_long',
        t('err.readingTooLong'),
      );
    }

    const deadline = Date.now() + BUDGET_MS;

    if (parsed.data.langs?.length) {
      /*
       * The batch, or nothing, and nothing is not a failure.
       *
       * A passage too long to render several times over comes back empty by
       * design — see `BATCHABLE_CHARS`. The contributor still has their
       * reading, the switch still works one language at a time, and the only
       * thing lost is the head start. Answering 200 with an empty set says
       * exactly that; a 502 would tell the screen something had broken.
       */
      const known = await listLanguages().catch(() => []);
      const wanted = known.filter((l) => parsed.data.langs!.includes(l.code));
      if (!wanted.length) {
        return fail(400, 'unknown_language', t('err.unknownLanguage'));
      }

      const made = await translateReadingEverywhere(
        parsed.data.blocks,
        wanted,
        parsed.data.sourceLanguage ?? null,
        { deadline },
      );
      return ok({ languages: made, machine: true });
    }

    if (!parsed.data.lang) {
      return fail(400, 'unknown_language', t('err.unknownLanguage'));
    }

    const language = await getLanguage(parsed.data.lang);
    if (!language) {
      return fail(400, 'unknown_language', t('err.unknownLanguage'));
    }

    const values = await translateReading(
      parsed.data.blocks,
      language,
      parsed.data.sourceLanguage ?? null,
      { deadline },
    );

    /*
     * Nothing translated is a failure, not an empty success.
     *
     * The archive has shipped that bug once already — a translator returning
     * `{}` and the caller counting the record as done. A switch that reports
     * success and leaves the English on screen is the same mistake wearing a
     * different hat.
     */
    if (Object.keys(values).length === 0) {
      return fail(502, 'translation_failed', t('err.translationFailed'));
    }

    return ok({ lang: language.code, values, machine: true });
  } catch (error) {
    if (error instanceof QuotaExhausted) {
      return fail(
        429,
        'quota_exhausted',
        t('err.translatorAllowance'),
      );
    }
    /*
     * A model that could not answer is not a broken archive.
     *
     * The contributor still has their reading, still has their document, and
     * can still submit. Saying so is the difference between a feature that did
     * not work and a page that looks like it has failed.
     */
    console.error('[analyze/translate] failed', error);
    return unexpected(error);
  }
}
