import type { Metadata } from 'next';
import { getMessages } from '@/lib/i18n';
import { BinManager } from '@/components/bin-manager';
import { EmptyState } from '@/components/primitives';
import { listDeletedItems } from '@/lib/items/queries';
import { getCurrentAdmin } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Bin' };
export const dynamic = 'force-dynamic';

/**
 * What volunteers have removed, and what can still be got back.
 *
 * A volunteer removing a record now bins it rather than destroying it. This is
 * where that stops being a promise: the record is here, whole, until an
 * administrator either restores it or decides it should go for good.
 */
export default async function BinPage() {
  const { t } = await getMessages();
  const admin = await getCurrentAdmin();

  if (!admin) {
    return (
      <EmptyState
        title={t('manage.administratorsOnly')}
        body="Restoring a record puts it back on the public portal and destroying one cannot be undone, so the bin is kept to administrators. Ask one to look."
        action={{ href: '/manage/vocabulary', label: 'Back to the vocabulary' }}
      />
    );
  }

  const items = await listDeletedItems();
  return <BinManager items={items} />;
}
