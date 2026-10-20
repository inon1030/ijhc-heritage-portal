import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getMessages } from '@/lib/i18n';
import { ok, fail, readJson } from '@/lib/api';
import { objectToCorrection } from '@/lib/items/mutations';
import { clientKey, rateLimit } from '@/lib/rate-limit';
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { t } = await getMessages();
  const { id } = await params;
  if (!rateLimit(`objection:${clientKey(request)}`, { limit: 10, windowMs: 600_000 }).allowed)
    return fail(429, 'limited', t('public.limited'));
  const parsed = z.object({ token: z.string().max(200), note: z.string().trim().max(2000) }).safeParse(await readJson(request));
  if (!z.uuid().safeParse(id).success || !parsed.success) return fail(400, 'invalid_request', t('public.expired'));
  try {
    return await objectToCorrection(id, parsed.data.token, parsed.data.note) ? ok({ saved: true }) : fail(409, 'closed', t('public.expired'));
  } catch { return fail(500, 'failed', t('public.failed')); }
}
