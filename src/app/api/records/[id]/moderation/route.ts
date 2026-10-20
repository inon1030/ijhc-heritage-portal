import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentVolunteer } from '@/lib/supabase/server';
import { getMessages } from '@/lib/i18n';
import { ok, fail, readJson } from '@/lib/api';
import { moderateRecordComment, saveCollector } from '@/lib/items/mutations';
import { CollectorInput } from '@/lib/items/public-input';
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { t } = await getMessages();
  if (!await getCurrentVolunteer()) return fail(403, 'forbidden', t('public.conflict'));
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail(400, 'invalid_request', t('public.invalid'));
  const input = await readJson(request);
  try {
    const collector = CollectorInput.safeParse(input);
    const comment = z.object({ commentId: z.uuid(), hidden: z.boolean() }).safeParse(input);
    const saved = collector.success ? await saveCollector(id, collector.data) :
      comment.success ? await moderateRecordComment(id, comment.data.commentId, comment.data.hidden) : false;
    return saved ? ok({ saved: true }) : fail(403, 'forbidden', t('public.conflict'));
  } catch { return fail(500, 'failed', t('public.failed')); }
}
