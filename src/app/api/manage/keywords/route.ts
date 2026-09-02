import { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, invalid, ok, unexpected } from '@/lib/api';
import { FIELD_KEYS } from '@/lib/fields/registry';
import { getCurrentAdmin, getCurrentVolunteer } from '@/lib/supabase/server';
import { COMMUNITIES } from '@/lib/types';
import { addKeyword, deleteKeyword, mergeKeyword, placeKeyword } from '@/lib/vocabulary/mutations';

/**
 * The controlled vocabulary.
 *
 * Adding is a volunteer act and removing is an admin act, because a delete
 * silently changes every record that already carries the term. Decided with the
 * client on 2026-08-27.
 *
 * Merging — making one term a variant of another — is a volunteer act too, and
 * deliberately so. It is the operation that keeps the vocabulary from
 * splintering, it destroys nothing (both spellings survive and both find the
 * same records), and an operation people must ask permission for is an
 * operation that does not happen. Only an administrator can *remove* a term,
 * which is the irreversible one.
 */

const Create = z.object({
  term: z.string().trim().min(2).max(60),
  community: z.enum(COMMUNITIES as [string, ...string[]]).nullable(),
  /** Which branch of the logical tree this term subdivides. */
  branchKey: z.enum(FIELD_KEYS as [string, ...string[]]).nullable().optional(),
});

const Amend = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('place'),
    id: z.string().uuid(),
    branchKey: z.enum(FIELD_KEYS as [string, ...string[]]),
  }),
  z.object({
    action: z.literal('merge'),
    /** The term that stops being its own idea. */
    id: z.string().uuid(),
    /** The one it becomes a spelling of. */
    intoId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('split'),
    /** A variant that turns out to be its own idea after all. */
    id: z.string().uuid(),
  }),
]);

export async function POST(request: NextRequest) {
  try {
    const volunteer = await getCurrentVolunteer();
    if (!volunteer) return fail(401, 'unauthorised', 'Sign in as a volunteer to add terms.');

    const parsed = Create.safeParse(await request.json());
    if (!parsed.success) return invalid(parsed.error);

    const keyword = await addKeyword(
      parsed.data.term,
      parsed.data.community as never,
      parsed.data.branchKey ?? null,
    );

    revalidatePath('/manage/vocabulary');
    return ok({ keyword }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      return fail(409, 'already_exists', 'That term is already in the vocabulary.');
    }
    return unexpected(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const volunteer = await getCurrentVolunteer();
    if (!volunteer) return fail(401, 'unauthorised', 'Sign in as a volunteer to change a term.');

    const parsed = Amend.safeParse(await request.json());
    if (!parsed.success) return invalid(parsed.error);

    if (parsed.data.action === 'place') {
      await placeKeyword(parsed.data.id, parsed.data.branchKey);
    } else if (parsed.data.action === 'merge') {
      if (parsed.data.id === parsed.data.intoId) {
        return fail(400, 'invalid_request', 'A term cannot be a spelling of itself.');
      }
      await mergeKeyword(parsed.data.id, parsed.data.intoId);
    } else {
      await mergeKeyword(parsed.data.id, null);
    }

    revalidatePath('/manage/vocabulary');
    return ok({ action: parsed.data.action });
  } catch (error) {
    // The trigger in 0021 refuses a chain of variants and a term that already
    // has variants of its own. Its message says which, and it is worth showing.
    const message = (error as { message?: string }).message ?? '';
    if (message.includes('variant')) return fail(409, 'invalid_merge', message);
    return unexpected(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return fail(403, 'forbidden', 'Removing a term is an administrator action.');
    }

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return fail(400, 'invalid_request', 'Which term?');

    await deleteKeyword(id);
    revalidatePath('/manage/vocabulary');
    return ok({ deleted: true });
  } catch (error) {
    return unexpected(error);
  }
}
