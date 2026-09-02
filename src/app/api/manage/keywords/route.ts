import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, invalid, ok, unexpected } from '@/lib/api';
import { getCurrentAdmin, getCurrentVolunteer } from '@/lib/supabase/server';
import { COMMUNITIES } from '@/lib/types';
import { addKeyword, deleteKeyword } from '@/lib/vocabulary/mutations';

/**
 * The controlled vocabulary.
 *
 * Adding is a volunteer act and removing is an admin act, because a delete
 * silently changes every record that already carries the term. Decided with the
 * client on 2026-08-27.
 */

const Create = z.object({
  term: z.string().trim().min(2).max(60),
  community: z.enum(COMMUNITIES as [string, ...string[]]).nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const volunteer = await getCurrentVolunteer();
    if (!volunteer) return fail(401, 'unauthorised', 'Sign in as a volunteer to add terms.');

    const parsed = Create.safeParse(await request.json());
    if (!parsed.success) return invalid(parsed.error);

    const keyword = await addKeyword(parsed.data.term, parsed.data.community as never);
    return ok({ keyword }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      return fail(409, 'already_exists', 'That term is already in the vocabulary.');
    }
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
    return ok({ deleted: true });
  } catch (error) {
    return unexpected(error);
  }
}
