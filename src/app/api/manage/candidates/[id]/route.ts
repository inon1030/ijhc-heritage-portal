import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, invalid, ok, readJson, unexpected } from '@/lib/api';
import { getCurrentVolunteer } from '@/lib/supabase/server';
import { acceptCandidate, declineCandidate } from '@/lib/vocabulary/mutations';

/**
 * A term the model proposed, judged.
 *
 * Accepting promotes it into the vocabulary so records can use it. Declining
 * only closes the queue entry — the model is free to suggest it again, and the
 * counter will show how often it does, which is itself an argument.
 */

const Body = z.object({ decision: z.enum(['accept', 'decline']) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const volunteer = await getCurrentVolunteer();
    if (!volunteer) return fail(401, 'unauthorised', 'Sign in as a volunteer to judge suggestions.');

    const { id } = await params;
    const parsed = Body.safeParse(await readJson(request));
    if (!parsed.success) return invalid(parsed.error);

    if (parsed.data.decision === 'accept') await acceptCandidate(id);
    else await declineCandidate(id);

    return ok({ decision: parsed.data.decision });
  } catch (error) {
    return unexpected(error);
  }
}
