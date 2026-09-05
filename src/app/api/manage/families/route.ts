import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, invalid, ok, readJson, unexpected } from '@/lib/api';
import { getCurrentAdmin, getCurrentVolunteer } from '@/lib/supabase/server';
import { COMMUNITIES } from '@/lib/types';
import { addFamily, deleteFamily } from '@/lib/vocabulary/mutations';

/**
 * The family register.
 *
 * Family names are how this material is actually organised — the Sassoons, the
 * Ezras, the Benjamins — and they are also the names of living people's
 * relatives. Same rule as the vocabulary: any volunteer may add, only an
 * administrator may remove.
 */

const Create = z.object({
  name: z.string().trim().min(2).max(80),
  community: z.enum(COMMUNITIES as [string, ...string[]]),
  notes: z.string().trim().max(400).nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const volunteer = await getCurrentVolunteer();
    if (!volunteer) return fail(401, 'unauthorised', 'Sign in as a volunteer to add a family.');

    const parsed = Create.safeParse(await readJson(request));
    if (!parsed.success) return invalid(parsed.error);

    const family = await addFamily(
      parsed.data.name,
      parsed.data.community as never,
      parsed.data.notes?.trim() || null,
    );
    return ok({ family }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      return fail(409, 'already_exists', 'That family is already registered for this community.');
    }
    return unexpected(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return fail(403, 'forbidden', 'Removing a family is an administrator action.');

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return fail(400, 'invalid_request', 'Which family?');

    await deleteFamily(id);
    return ok({ deleted: true });
  } catch (error) {
    return unexpected(error);
  }
}
