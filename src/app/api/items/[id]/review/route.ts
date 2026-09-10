import { NextRequest, after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, invalid, ok, readJson, unexpected } from '@/lib/api';
import { ACCESS_LEVELS } from '@/lib/access';
import { FIELD_KEYS, fieldDef, isValidValue } from '@/lib/fields/registry';
import { binItem, reviewItem } from '@/lib/items/mutations';
import { getCurrentVolunteer } from '@/lib/supabase/server';
import { translateRecord, verifyRecord } from '@/lib/translate';
import { setItemFamilies } from '@/lib/vocabulary/mutations';
import { readVocabulary } from '@/lib/vocabulary/load';
import { resolveTerms } from '@/lib/vocabulary/thesaurus';
import { CATEGORIES, COMMUNITIES } from '@/lib/types';

const STATUSES = ['pending', 'accepted', 'rejected', 'shadow_gallery'] as const;

const Body = z.object({
  status: z.enum(STATUSES),
  title: z.string().trim().min(1).max(200),
  category: z.enum(CATEGORIES as [string, ...string[]]).nullable().optional(),
  description: z.string().trim().max(4000).nullable(),
  community: z.enum(COMMUNITIES as [string, ...string[]]).nullable(),
  provenance: z.string().trim().max(2000).nullable(),
  keywords: z.array(z.string().trim().min(1).max(60)).max(20),
  language: z.string().trim().max(60).nullable(),
  period: z.string().trim().max(120).nullable(),
  originPlace: z.string().trim().max(200).nullable(),
  access: z.enum(ACCESS_LEVELS as [string, ...string[]]),
  familyIds: z.array(z.string().uuid()).max(12).optional(),
  /**
   * The record's tree fields, complete. Absent keys are removed, which is how a
   * reviewer says "the item does not carry this" — see reviewItem.
   */
  fields: z
    .array(z.object({ key: z.enum(FIELD_KEYS as [string, ...string[]]), value: z.string().trim().min(1).max(2000) }))
    .max(FIELD_KEYS.length)
    .refine(
      (fields) => fields.every((f) => !fieldDef(f.key)?.column && isValidValue(f.key, f.value)),
      { message: 'A field is not one held as a row, or its value is not one that field takes.' },
    )
    .optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    // Checked here as well as in RLS, so an unauthenticated caller gets a clear
    // 401 instead of a confusing empty result. It asks for an *approved*
    // volunteer: since 0008 a requested account has a profile row and no
    // rights, and "has a profile" would have let it through this door.
    if (!(await getCurrentVolunteer())) {
      return fail(401, 'unauthenticated', 'Sign in as an approved volunteer to review submissions.');
    }

    const { id } = await context.params;
    const parsed = Body.safeParse(await readJson(request));
    if (!parsed.success) return invalid(parsed.error);

    const body = parsed.data;
    const result = await reviewItem({
      itemId: id,
      status: body.status,
      title: body.title,
      category: (body.category ?? null) as never,
      description: body.description,
      community: body.community as never,
      provenance: body.provenance,
      /*
       * Resolved against the archive's own list, which does two things at once.
       *
       * A variant becomes its preferred spelling — a reviewer picking `Bombay`
       * from an old tab writes `Mumbai`, so the collection stays whole. And a
       * word the vocabulary does not hold is dropped rather than written: the
       * workbench only offers listed terms, but the workbench is not the only
       * thing that can POST here, and "the vocabulary is closed" has to be true
       * at the endpoint or it is not true at all.
       *
       * Dropped rather than refused, because a stale tab holding a term an
       * administrator has just removed is ordinary, and failing a volunteer's
       * whole save over one word is not a good trade.
       */
      keywords: resolveTerms(await readVocabulary(), body.keywords),
      language: body.language,
      period: body.period,
      originPlace: body.originPlace,
      access: body.access as never,
      fields: body.fields ?? [],
    });

    if (!result.ok) {
      const status = result.code === 'not_found' ? 404 : result.code === 'forbidden' ? 401 : 409;
      return fail(status, result.code, result.message);
    }

    // After the decision, so a rejected transition does not rewrite the
    // families of a record it did not change.
    if (body.familyIds) await setItemFamilies(id, body.familyIds);

    /*
     * Published means published in every language.
     *
     * `after` runs this once the volunteer already has their response, so the
     * review does not wait on a translator that takes between two and fifty
     * seconds — and, more to the point, a review can never fail because Google
     * is busy. The archive's own material and a volunteer's decision are not
     * held hostage to a third party.
     *
     * Only on acceptance. Translating a rejected record spends five calls on
     * something nobody will read, and a record still pending is text a
     * volunteer is in the middle of changing.
     *
     * Everything it misses — a record published before this existed, a
     * correction made later, a language that was refusing at the time — is
     * picked up by the nightly sweep in /api/cron/translate.
     */
    if (body.status === 'accepted') {
      after(async () => {
        try {
          await translateRecord(id);

          /*
           * And then check that it worked.
           *
           * Making the translations and assuming they were made is the fault
           * this project keeps finding: a batch that lost Malayalam to the
           * script check, a language refused for quota, a 503 on the way out —
           * each leaves a record that reads as published in five languages and
           * is not. The check costs a select and no model call.
           *
           * One retry, because the common causes are transient and the second
           * attempt is the difference between a record that is complete now and
           * one that is complete tomorrow night. If it is still short, the
           * sweep has it, and the line below is what says so out loud instead
           * of the archive quietly believing itself finished.
           */
          const first = await verifyRecord(id);
          if (first.complete) return;

          console.warn('[review] incomplete after publication, retrying', first.missing);
          await translateRecord(id);

          const second = await verifyRecord(id);
          if (!second.complete) {
            console.error(
              '[review] still incomplete; the nightly sweep will finish it',
              second.missing,
            );
          }
        } catch (error) {
          console.error('[review] translating after publication', error);
        }
      });
    }

    revalidatePath('/review');
    revalidatePath('/portal');
    revalidatePath(`/portal/${id}`);

    return ok({ id: result.item.id, status: result.item.status });
  } catch (error) {
    return unexpected(error);
  }
}

/**
 * Sends a record to the bin.
 *
 * Still DELETE, because that is what the caller means and the record does
 * disappear from every screen. What changed is that it is now recoverable: an
 * administrator can restore it from /manage/bin, and only an administrator can
 * destroy it. See migration 0018.
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const volunteer = await getCurrentVolunteer();
    if (!volunteer) {
      return fail(401, 'unauthenticated', 'Sign in to delete records.');
    }

    const { id } = await context.params;

    // Optional, and worth having: the bin is read by whoever has to decide
    // whether a restore is warranted, and "duplicate of 4f2a" answers that
    // where a bare timestamp does not.
    let reason: string | null = null;
    try {
      const body = await request.json();
      if (typeof body?.reason === 'string') reason = body.reason.slice(0, 300);
    } catch {
      // No body is the ordinary case.
    }

    const removed = await binItem(id, volunteer.id, reason);
    if (!removed) return fail(404, 'not_found', 'That record no longer exists.');

    revalidatePath('/review');
    revalidatePath('/portal');

    return ok({ id });
  } catch (error) {
    return unexpected(error);
  }
}
