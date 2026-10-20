import { reviewGuard } from '@/lib/items/review-guard';
import { z } from 'zod';
import { getCurrentVolunteer } from '@/lib/supabase/server';
import { getMessages } from '@/lib/i18n';
import { fail, ok, readJson, unexpected } from '@/lib/api';
import { readDuplicates } from '@/lib/items/queries';
import { resolveDuplicate } from '@/lib/items/mutations';

type Context = { params: Promise<{ id: string }> };
const Body = z.object({ pairId: z.string().uuid(), resolution: z.enum(['not_duplicate', 'merged']) });
export async function GET(_request: Request, context: Context) {
  const { t } = await getMessages();
  if (!await getCurrentVolunteer()) return fail(403, 'forbidden', t('phase2.forbidden'));
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, 'invalid_request', t('phase2.failed'));
  try { return ok(await readDuplicates(id)); }
  catch (error) { return unexpected(error, '/api/items/[id]/duplicates'); }
}
export async function POST(request: Request, context: Context) {
  const { t } = await getMessages();
  const actor = await getCurrentVolunteer();
  if (!actor) return fail(403, 'forbidden', t('phase2.forbidden'));
  const { id } = await context.params;
  const body = Body.safeParse(await readJson(request));
  if (!body.success || !z.string().uuid().safeParse(id).success) return fail(400, 'invalid_request', t('phase2.failed'));
  if (body.data.resolution === 'merged') {
    const denied = await reviewGuard(id);
    if (denied) return denied;
    const pair = (await readDuplicates(id)).find(p => p.id === body.data.pairId);
    if (pair) { const otherDenied = await reviewGuard(pair.item.id); if (otherDenied) return otherDenied; }
  }
  try { return ok({ keptId: await resolveDuplicate(id, body.data.pairId, actor.id, body.data.resolution) }); }
  catch { return fail(409, 'conflict', t('duplicates.changed')); }
}
