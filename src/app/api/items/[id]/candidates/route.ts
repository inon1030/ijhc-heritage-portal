import { z } from 'zod';
import { fail, ok, readJson, unexpected } from '@/lib/api';
import { reviewGuard } from '@/lib/items/review-guard';
import { readReviewCandidates } from '@/lib/items/queries';
import { decideReviewCandidate } from '@/lib/items/mutations';
import { getMessages } from '@/lib/i18n';

type Context = { params: Promise<{ id: string }> };
const Body = z.object({ id: z.string().uuid(), action: z.enum(['create', 'decline']) });
async function handle(request: Request, context: Context) {
  const { t } = await getMessages();
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, 'invalid_request', t('review3.failed'));
  try {
    const denied = await reviewGuard(id);
    if (denied) return denied;
    if (request.method === 'GET') return ok(await readReviewCandidates(id));
    const body = Body.safeParse(await readJson(request));
    if (!body.success) return fail(400, 'invalid_request', t('review3.failed'));
    return ok({ term: await decideReviewCandidate(id, body.data.id, body.data.action) });
  } catch (error) { return unexpected(error, '/api/items/[id]/candidates'); }
}
export const GET = handle;
export const POST = handle;
