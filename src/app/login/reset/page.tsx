import { PasswordRecoveryForm } from '@/components/password-recovery-form';
export const metadata = { referrer: 'no-referrer' as const, robots: { index: false, follow: false } };
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token_hash?: string }> }) {
  const { token_hash } = await searchParams;
  return <PasswordRecoveryForm reset tokenHash={typeof token_hash === 'string' ? token_hash : undefined} />;
}
