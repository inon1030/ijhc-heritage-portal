import Link from 'next/link';
import { Hourglass } from 'lucide-react';
import { getMessages } from '@/lib/i18n';

/**
 * What a signed-in but unapproved account sees.
 *
 * Without this the review queue would render "the queue is clear" — RLS returns
 * an empty set, which is correct and reads as a lie. Saying plainly that the
 * account is waiting is both true and the only thing the person can act on.
 */
export async function AwaitingApproval({ email }: { email: string }) {
  const { t } = await getMessages();
  return (
    <div className="mx-auto max-w-xl px-6 py-20 text-center">
      <Hourglass size={32} strokeWidth={1.4} className="mx-auto text-accent" aria-hidden />
      <h1 className="mt-5 font-display text-3xl">{t('login.awaitingApproval')}</h1>
      <p className="mt-4 leading-relaxed text-muted">{t('login.awaitingBody', { email })}</p>
      <p className="mt-8">
        <Link href="/portal" className="underline underline-offset-4 hover:text-accent">
          {t('login.browseMeanwhile')}
        </Link>
      </p>
    </div>
  );
}
