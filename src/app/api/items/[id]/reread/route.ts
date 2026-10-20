import { z } from 'zod';
import { getCurrentVolunteer } from '@/lib/supabase/server';
import { getMessages } from '@/lib/i18n';
import { fail, ok, unexpected } from '@/lib/api';
import { readRetryState } from '@/lib/items/queries';
import { retryItemReading } from '@/lib/items/mutations';

export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const { t } = await getMessages();
  if (!await getCurrentVolunteer()) return fail(403, 'forbidden', t('phase2.forbidden'));
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, 'invalid_request', t('phase2.failed'));
  try { return ok(await readRetryState(id)); }
  catch (error) { return unexpected(error, '/api/items/[id]/reread'); }
}
export async function POST(_request: Request, context: Context) {
  const { t } = await getMessages();
  const actor = await getCurrentVolunteer();
  if (!actor) return fail(403, 'forbidden', t('phase2.forbidden'));
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, 'invalid_request', t('phase2.failed'));
  try {
    if (!await retryItemReading(id, actor.id)) return fail(409, 'unavailable', t('retry.unavailable'));
    return ok({ attempted: true });
  } catch (error) { return unexpected(error, '/api/items/[id]/reread'); }
}
