import { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, invalid, ok, unexpected } from '@/lib/api';
import {
  findOrCreateContributor,
  linkContributorToFamily,
  setContributorName,
  unlinkContributorFromFamily,
} from '@/lib/contributors';
import { getCurrentVolunteer } from '@/lib/supabase/server';

/**
 * Which addresses belong to which family.
 *
 * A volunteer's work, not an administrator's: this is cataloguing — the same
 * judgement as deciding a record is Baghdadi — and it is reversible in one
 * click, which is the test that separates the two roles everywhere else in
 * this archive. Removing a *family* is still an administrator's act, because
 * that changes records that point at it.
 *
 * POST takes an address rather than an id on purpose. A volunteer who knows the
 * Sassoons correspond from a particular address should be able to record that
 * before anything has ever been uploaded from it, so the contributor row is
 * created if the archive has not seen them before.
 */

const Link = z.object({
  email: z.string().trim().email().max(160),
  fullName: z.string().trim().min(2).max(120).nullable().optional(),
  familyId: z.string().uuid().nullable().optional(),
});

const Rename = z.object({
  contributorId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120).nullable(),
});

export async function POST(request: NextRequest) {
  try {
    if (!(await getCurrentVolunteer())) {
      return fail(401, 'unauthorised', 'Sign in as a volunteer to manage contributors.');
    }

    const parsed = Link.safeParse(await request.json());
    if (!parsed.success) return invalid(parsed.error);

    const contributor = await findOrCreateContributor(
      parsed.data.email,
      parsed.data.fullName ?? null,
    );

    if (parsed.data.familyId) {
      await linkContributorToFamily(contributor.id, parsed.data.familyId);
    }

    revalidatePath('/manage/families');
    return ok({ contributor }, { status: 201 });
  } catch (error) {
    return unexpected(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!(await getCurrentVolunteer())) {
      return fail(401, 'unauthorised', 'Sign in as a volunteer to correct a name.');
    }

    const parsed = Rename.safeParse(await request.json());
    if (!parsed.success) return invalid(parsed.error);

    await setContributorName(parsed.data.contributorId, parsed.data.fullName);

    revalidatePath('/manage/families');
    return ok({ updated: true });
  } catch (error) {
    return unexpected(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!(await getCurrentVolunteer())) {
      return fail(401, 'unauthorised', 'Sign in as a volunteer to remove a link.');
    }

    const url = new URL(request.url);
    const contributorId = url.searchParams.get('contributorId');
    const familyId = url.searchParams.get('familyId');

    if (!contributorId || !familyId) {
      return fail(400, 'invalid_request', 'Which address, and which family?');
    }

    // Unlinks only. The contributor row stays: they have sent the archive
    // material, and deleting the person because one family link was wrong would
    // orphan every record that points at them.
    await unlinkContributorFromFamily(contributorId, familyId);

    revalidatePath('/manage/families');
    return ok({ unlinked: true });
  } catch (error) {
    return unexpected(error);
  }
}
