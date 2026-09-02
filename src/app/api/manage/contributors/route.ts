import { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, invalid, ok, unexpected } from '@/lib/api';
import {
  eraseContributor,
  findOrCreateContributor,
  linkContributorToFamily,
  setContributorEmail,
  setContributorName,
  unlinkContributorFromFamily,
} from '@/lib/contributors';
import { getCurrentAdmin, getCurrentVolunteer } from '@/lib/supabase/server';

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

/**
 * Correcting what the archive holds about a person.
 *
 * Both fields are optional and at least one must be present, because the two
 * corrections are independent: a bounced reply means the address is wrong, and
 * a volunteer learning a surname means the name was blank.
 */
const Amend = z
  .object({
    contributorId: z.string().uuid(),
    fullName: z.string().trim().min(2).max(120).nullable().optional(),
    email: z.string().trim().email().max(160).optional(),
  })
  .refine((v) => v.fullName !== undefined || v.email !== undefined, {
    message: 'Nothing to change.',
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

    const parsed = Amend.safeParse(await request.json());
    if (!parsed.success) return invalid(parsed.error);

    if (parsed.data.fullName !== undefined) {
      await setContributorName(parsed.data.contributorId, parsed.data.fullName);
    }
    if (parsed.data.email !== undefined) {
      await setContributorEmail(parsed.data.contributorId, parsed.data.email);
    }

    revalidatePath('/manage/families');
    return ok({ updated: true });
  } catch (error) {
    // One row per address. A correction that lands on somebody the archive
    // already knows is not a failure — it means the two are the same person —
    // and saying so is more use than "that did not go through".
    if ((error as { code?: string }).code === '23505') {
      return fail(
        409,
        'already_known',
        'The archive already holds that address under another contributor. Link the records to that one instead.',
      );
    }
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

    if (!contributorId) return fail(400, 'invalid_request', 'Which contributor?');

    /*
     * Two different acts behind one verb, told apart by whether a family was
     * named.
     *
     * With a family: unlink. A volunteer's, and reversible — the contributor
     * stays and so does every record.
     *
     * Without one: erase the person. An administrator's, irreversible, and the
     * thing the handling notice promises. `items.contributor_id` is ON DELETE
     * SET NULL since 0022, so the material stays and only the link to a named
     * human being goes.
     */
    if (familyId) {
      await unlinkContributorFromFamily(contributorId, familyId);
      revalidatePath('/manage/families');
      return ok({ unlinked: true });
    }

    if (!(await getCurrentAdmin())) {
      return fail(403, 'forbidden', 'Erasing a contributor is an administrator action.');
    }

    const erased = await eraseContributor(contributorId);
    if (!erased) return fail(404, 'not_found', 'No such contributor.');

    revalidatePath('/manage/families');
    return ok({ erased: true });
  } catch (error) {
    return unexpected(error);
  }
}
