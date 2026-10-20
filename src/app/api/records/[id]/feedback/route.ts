import { randomUUID } from 'node:crypto';
import { after, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getMessages } from '@/lib/i18n';
import { ok, fail, readJson } from '@/lib/api';
import { getPublishedItem } from '@/lib/items/queries';
import { createPublicFeedback } from '@/lib/items/mutations';
import { correctionFields } from '@/lib/items/correction-fields';
import { PublicInput, correctionChanges, hasTooManyLinks } from '@/lib/items/public-input';
import { publicToken, verifyPublicToken } from '@/lib/items/public-tokens';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { notifyRecordFeedback } from '@/lib/mail/record-feedback';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { t } = await getMessages();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail(404, 'not_found', t('record.notFound'));
  try {
    const input = PublicInput.safeParse(await readJson(request));
    if (!input.success || input.data.website || !verifyPublicToken('form', id, input.data.token))
      return fail(400, 'invalid_request', t('public.invalid'));
    const body = input.data;
    const kind = body.values ? 'correction' : 'comment';
    if ((!body.values && !body.body) || hasTooManyLinks([body.body, ...Object.values(body.values ?? {})].join(' ')))
      return fail(400, 'invalid_request', t('public.invalid'));
    const ip = rateLimit(`feedback:ip:${clientKey(request)}`, { limit: 6, windowMs: 600_000 });
    const itemLimit = rateLimit(`feedback:item:${id}`, { limit: 30, windowMs: 600_000 });
    if (!ip.allowed || !itemLimit.allowed) return fail(429, 'rate_limited', t('public.limited'));
    const item = await getPublishedItem(id);
    if (!item || !item.category) return fail(404, 'not_found', t('record.notFound'));
    let changes;
    try {
      if (body.values && !body.originals) throw new Error('missing_originals');
      changes = body.values ? correctionChanges(body.values, correctionFields(item, t), body.originals) : undefined;
    }
    catch { return fail(400, 'invalid_request', t('public.invalid')); }
    const feedbackId = randomUUID();
    const objectionToken = kind === 'correction' ? publicToken('objection', feedbackId) : undefined;
    const saved = await createPublicFeedback({
      id: feedbackId, itemId: id, kind, ...body, changes, objectionToken,
    });
    if (!saved) return fail(404, 'not_found', t('record.notFound'));
    after(async () => {
      try { await notifyRecordFeedback(item, kind, body.body, changes, feedbackId, objectionToken); }
      catch { console.error('[mail] record feedback notice failed', feedbackId); }
    });
    return ok({ saved: true }, { status: 201 });
  } catch {
    return fail(500, 'failed', t('public.failed'));
  }
}
