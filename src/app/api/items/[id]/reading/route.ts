import { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, invalid, ok, readJson, unexpected } from '@/lib/api';
import { correctReading } from '@/lib/items/mutations';
import { getCurrentVolunteer } from '@/lib/supabase/server';

/**
 * A volunteer's correction of the text the machine read off a file.
 *
 * Empty means "no correction": the reading goes back to the machine's text.
 * The machine's text itself is never written here. See migration 0030.
 */
const Body = z.object({
  analysisId: z.string().uuid(),
  ocrText: z.string().trim().max(20000).nullable(),
  transcript: z.string().trim().max(100000).nullable(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    // The same door as the review decision: an approved volunteer, not merely
    // somebody with a profile row.
    const volunteer = await getCurrentVolunteer();
    if (!volunteer) {
      return fail(401, 'unauthenticated', 'Sign in as an approved volunteer to correct a reading.');
    }

    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) return fail(404, 'not_found', 'No such record.');

    const parsed = Body.safeParse(await readJson(request));
    if (!parsed.success) return invalid(parsed.error);

    const saved = await correctReading({
      itemId: id,
      analysisId: parsed.data.analysisId,
      ocrText: parsed.data.ocrText || null,
      transcript: parsed.data.transcript || null,
      actorId: volunteer.id,
    });
    if (!saved) return fail(404, 'not_found', 'No such reading on this record.');

    revalidatePath(`/review/${id}`);
    return ok({ saved: true });
  } catch (error) {
    return unexpected(error, '/api/items/[id]/reading');
  }
}
