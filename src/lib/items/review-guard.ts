import 'server-only';
import { getCurrentVolunteer } from '@/lib/supabase/server';
import { getItemDetail } from './queries';
import { canEditRecord } from './edit-permission';
import { getMessages } from '@/lib/i18n';
import { fail } from '@/lib/api';

export async function reviewGuard(id: string) {
  const [actor, item, { t }] = await Promise.all([getCurrentVolunteer(), getItemDetail(id), getMessages()]);
  if (!actor) return fail(401, 'unauthenticated', t('review3.signIn'));
  if (!item) return fail(404, 'not_found', t('review3.missing'));
  if (!canEditRecord(actor, item)) return fail(403, 'forbidden', t('review3.readOnly'));
  return null;
}
