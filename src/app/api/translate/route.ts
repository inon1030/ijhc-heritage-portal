import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getMessages } from '@/lib/i18n';
import { fail, invalid, ok, readJson, unexpected } from '@/lib/api';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { createServerSupabase } from '@/lib/supabase/server';
import { getLanguage } from '@/lib/translate/languages';
import { translateItem } from '@/lib/translate';

/**
 * Translate one record into one language, and remember it.
 *
 * The page renders first with whatever is already stored — the original where
 * there is nothing — and this fills in the rest. A page render never waits on a
 * third party being reachable, and a reader is never shown a spinner where a
 * record should be.
 *
 * ── this is an endpoint that spends money, so ───────────────────────────────
 *
 * The archive has had this exact bug once. `/api/analyze` was unauthenticated
 * *and* unrate-limited: forty consecutive calls to production all went through,
 * each one a billed model call, and each able to return the reading of any
 * object in the bucket. Four things stop the same shape here.
 *
 * 1. **The record is fetched as the caller.** Not with the service role — with
 *    the caller's own session, so RLS decides. An anonymous caller reaches
 *    published records and nothing else; asking for the id of something in the
 *    review queue returns the same 404 as asking for an id that does not exist.
 *    Without this, the endpoint would be a way to read unpublished family
 *    material by asking for it in Hindi.
 *
 * 2. **Transcripts need a volunteer.** OCR and audio transcription are
 *    volunteer-only (`ai_analyses_volunteer_select`), so their translations are
 *    too — in the policy (0024) and again here, because a permission enforced
 *    in one place is a permission enforced until somebody changes that place.
 *
 * 3. **Rate limited**, by the same key as every other public endpoint.
 *
 * 4. **Cache first.** `translateItem` makes no call when nothing is missing or
 *    stale, so the common case — the second reader of a record — costs a select.
 */

const Body = z.object({
  itemId: z.string().uuid(),
  lang: z.string().min(2).max(12),
});

/**
 * A reader is waiting, so this one has a clock.
 *
 * It had none: `translateItem` was called with no deadline, on the reasoning
 * that nobody is watching a background fetch and a translation worth 51 seconds
 * is worth having. Measured against production, that reasoning met a model that
 * spent **2 minutes 23 seconds** deciding to answer `RECITATION` and return no
 * text. Whatever is on the other end of that request is a browser, and a
 * browser gives up long before the archive does.
 *
 * Twenty seconds against a twenty-five second `maxDuration`, on the same
 * pattern as the nightly sweep: the bound is handed down to the model call, so
 * a call that starts inside it cannot run past it. What does not finish is not
 * lost — it stays outstanding, and the sweep finds it tonight.
 */
const BUDGET_MS = 20_000;

export const maxDuration = 25;

export async function POST(request: NextRequest) {
  const { t } = await getMessages();

  try {
    const limit = rateLimit(`translate:${clientKey(request)}`, { limit: 30, windowMs: 60_000 });
    if (!limit.allowed) {
      return fail(429, 'rate_limited', t('err.tooManyTranslations', { seconds: limit.retryAfterSeconds }));
    }

    const parsed = Body.safeParse(await readJson(request));
    if (!parsed.success) return invalid(parsed.error);

    const language = await getLanguage(parsed.data.lang);
    if (!language) {
      return fail(400, 'unknown_language', t('err.unknownLanguage'));
    }

    const supabase = await createServerSupabase();

    // As the caller. RLS is what decides whether this record exists for them.
    const { data: item, error } = await supabase
      .from('items')
      .select('id, language, title, description, provenance, period, origin_place')
      .eq('id', parsed.data.itemId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    if (!item) return fail(404, 'not_found', 'No such record.');

    // Volunteer-only, and asked as a question about the caller rather than
    // about the request: `ai_analyses` returns nothing at all to anyone else,
    // so an empty result is both the answer and the permission check.
    const { data: analysis } = await supabase
      .from('ai_analyses')
      .select('ocr_text, transcript')
      .eq('item_id', item.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const rendered = await translateItem(
      {
        ...(item as Record<string, unknown>),
        id: item.id as string,
        transcript: analysis?.transcript ?? analysis?.ocr_text ?? null,
      },
      language.code,
      { deadline: Date.now() + BUDGET_MS },
    );

    return ok(rendered);
  } catch (error) {
    return unexpected(error);
  }
}
