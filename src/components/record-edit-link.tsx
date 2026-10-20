import Link from 'next/link';
import { getCurrentVolunteer } from '@/lib/supabase/server';
import { getItemDetail } from '@/lib/items/queries';
import { canEditRecord } from '@/lib/items/edit-permission';
import { getMessages } from '@/lib/i18n';

export async function RecordEditLink({ itemId }: { itemId: string }) {
  const actor = await getCurrentVolunteer();
  if (!actor) return null;
  const item = await getItemDetail(itemId);
  if (!item || !canEditRecord(actor, item)) return null;
  const { t } = await getMessages();
  return <Link href={`/review/${itemId}`} className="inline-flex min-h-11 items-center rounded-full border border-rule px-5 focus-visible:outline-2 focus-visible:outline-offset-4">{t('review3.edit')}</Link>;
}
