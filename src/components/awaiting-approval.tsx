import Link from 'next/link';
import { Hourglass } from 'lucide-react';

/**
 * What a signed-in but unapproved account sees.
 *
 * Without this the review queue would render "the queue is clear" — RLS returns
 * an empty set, which is correct and reads as a lie. Saying plainly that the
 * account is waiting is both true and the only thing the person can act on.
 */
export function AwaitingApproval({ email }: { email: string }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-20 text-center">
      <Hourglass size={32} strokeWidth={1.4} className="mx-auto text-accent" aria-hidden />
      <h1 className="mt-5 font-display text-3xl">Your account is waiting for approval</h1>
      <p className="mt-4 leading-relaxed text-muted">
        <span className="machine">{email}</span> is registered, and an administrator has to approve
        it before the review queue opens. Nothing else is needed from you.
      </p>
      <p className="mt-8">
        <Link href="/portal" className="underline underline-offset-4 hover:text-accent">
          Browse the archive in the meantime
        </Link>
      </p>
    </div>
  );
}
