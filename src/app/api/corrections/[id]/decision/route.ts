import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentVolunteer } from '@/lib/supabase/server';
import { getMessages } from '@/lib/i18n';
import { ok, fail, readJson } from '@/lib/api';
import { decideRecordCorrection } from '@/lib/items/mutations';
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { t } = await getMessages();
  if (!await getCurrentVolunteer()) return fail(403, 'forbidden', t('public.conflict'));
  const { id } = await params;
  const parsed = z.object({ accept: z.boolean(), objectionAt: z.iso.datetime({ offset: true }).nullable() }).safeParse(await readJson(request));
  if (!z.uuid().safeParse(id).success || !parsed.success) return fail(400, 'invalid_request', t('public.invalid'));
  try {
    const saved = await decideRecordCorrection(id, parsed.data.accept, parsed.data.objectionAt);
    return saved ? ok({ saved: true }) : fail(409, 'conflict', t('public.conflict'));
  } catch { return fail(409, 'conflict', t('public.conflict')); }
}
