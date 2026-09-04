import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, invalid, ok, unexpected } from '@/lib/api';
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

export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(`translate:${clientKey(request)}`, { limit: 30, windowMs: 60_000 });
    if (!limit.allowed) {
      return fail(429, 'rate_limited', `Too many translations at once. Try again in ${limit.retryAfterSeconds} seconds.`);
    }

    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) return invalid(parsed.error);

    const language = await getLanguage(parsed.data.lang);
    if (!language) {
      return fail(400, 'unknown_language', 'This archive does not publish in that language.');
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
    );

    return ok(rendered);
  } catch (error) {
    return unexpected(error);
  }
}
