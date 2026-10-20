import { z } from 'zod';
import { fail, ok, readJson, unexpected } from '@/lib/api';
import { reviewGuard } from '@/lib/items/review-guard';
import { readReviewDraft } from '@/lib/items/queries';
import { saveReviewDraft, discardReviewDraft } from '@/lib/items/mutations';
import { DraftPayload } from '@/lib/items/draft-schema';
import { getMessages } from '@/lib/i18n';

type Context = { params: Promise<{ id: string }> };
async function handle(request: Request, context: Context) {
  const { t } = await getMessages();
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, 'invalid_request', t('review3.failed'));
  try {
    const denied = await reviewGuard(id);
    if (denied) return denied;
    if (request.method === 'GET') return ok(await readReviewDraft(id));
    if (request.method === 'DELETE') { await discardReviewDraft(id); return ok({ discarded: true }); }
    const body = DraftPayload.safeParse(await readJson(request));
    if (!body.success) return fail(400, 'invalid_request', t('review3.failed'));
    return ok(await saveReviewDraft(id, body.data));
  } catch (error) { return unexpected(error, '/api/items/[id]/draft'); }
}
export const GET = handle;
export const PUT = handle;
export const DELETE = handle;
