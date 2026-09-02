import type { Metadata } from 'next';
import { AccountManager } from '@/components/account-manager';
import { EmptyState } from '@/components/primitives';
import { getCurrentAdmin } from '@/lib/supabase/server';
import { listAccounts } from '@/lib/vocabulary/queries';

export const metadata: Metadata = { title: 'Accounts' };
export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const admin = await getCurrentAdmin();

  // A volunteer who types the URL is told what is missing rather than being
  // bounced to a blank page or, worse, shown the roll.
  if (!admin) {
    return (
      <EmptyState
        title="Administrators only"
        body="Approving accounts decides who can change the archive, so it is kept to administrators. Ask one to make the change for you."
        action={{ href: '/manage/vocabulary', label: 'Back to the vocabulary' }}
      />
    );
  }

  const accounts = await listAccounts();
  return <AccountManager accounts={accounts} currentId={admin.id} />;
}
