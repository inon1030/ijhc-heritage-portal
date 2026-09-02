'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookMarked,
  ClipboardCheck,
  Globe,
  LogIn,
  LogOut,
  ShieldCheck,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import type { Profile } from '@/lib/types';

/**
 * Everything the site can do, behind the fold at the top of every page.
 *
 * The front door offers exactly two things — browse, contribute — and this is
 * where the rest lives: signing in, asking for an account, the review queue,
 * the vocabulary, the family list, approving accounts, signing out. One hover
 * on the strip and it is all there.
 *
 * Two rows, because they answer different questions. The first is *what a
 * visitor can do* and everybody sees it. The second is *what a volunteer
 * maintains*, and it appears only for an approved account — a quieter strip
 * under a rule, so the archive's own tools never compete with the two doors
 * that matter to everyone else.
 *
 * Sizing is deliberate throughout: 17px labels in 46px targets, which is the
 * size a finger actually hits. The current page is marked twice over — a filled
 * pill and a heavier label — because one signal on its own is easy to miss on a
 * masthead that is the same colour as the page.
 */

export interface NavProps {
  /**
   * Null when nobody is signed in. Present but role 'pending' when the account
   * exists and has not been approved — which is why this is the whole profile
   * and not just an address.
   */
  profile: Profile | null;
  queueCount: number;
}

const PUBLIC_LINKS = [
  { href: '/portal', label: 'Portal', icon: Globe },
  { href: '/upload', label: 'Contribute', icon: Upload },
] as const;

export function SiteNav({ profile, queueCount }: NavProps) {
  const pathname = usePathname();
  const approved = profile?.role === 'volunteer' || profile?.role === 'admin';
  const isAdmin = profile?.role === 'admin';

  /*
   * Icon first, label folded away.
   *
   * The control is pinned to the far edge and shows only its icon; hovering
   * unrolls the label beside it. `max-width` rather than `width` because the
   * label's width is whatever the word happens to measure, and animating to a
   * guessed number is how these end up clipping the last letter.
   *
   * The accessible name is on the button and never hidden, so this is a visual
   * fold and not a secret.
   */
  const account = profile ? (
    <form action="/api/auth/signout" method="post" className="md:ml-auto">
      <button
        type="submit"
        title={`Signed in as ${profile.email}`}
        className="group/out flex h-[46px] w-full items-center gap-0 rounded-full border border-rule-strong bg-paper px-3.5 text-muted transition-all duration-300 hover:border-critical/40 hover:bg-critical/5 hover:text-critical md:w-auto"
      >
        <LogOut size={18} strokeWidth={1.9} aria-hidden className="shrink-0" />
        <span
          aria-hidden
          className="max-w-[8rem] overflow-hidden whitespace-nowrap pl-2.5 transition-all duration-300 md:max-w-0 md:pl-0 md:opacity-0 md:group-hover/out:max-w-[8rem] md:group-hover/out:pl-2.5 md:group-hover/out:opacity-100"
        >
          Sign out
        </span>
        <span className="sr-only">Sign out</span>
      </button>
    </form>
  ) : (
    // Signing in and asking for an account are two different intentions, and
    // one link labelled "Volunteer sign in" hid the second behind a tab nobody
    // knew was there.
    <span className="flex flex-col gap-2 md:ml-auto md:flex-row md:items-center">
      <Link
        href="/login?mode=request"
        className="flex h-[46px] items-center justify-center gap-2 rounded-full px-4 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
      >
        <UserPlus size={18} strokeWidth={1.9} aria-hidden />
        Create an account
      </Link>
      <Link
        href="/login"
        className="flex h-[46px] items-center justify-center gap-2 rounded-full border border-rule-strong px-5 font-medium transition-all duration-200 hover:border-accent-strong hover:bg-accent-wash hover:shadow-soft"
      >
        <LogIn size={18} strokeWidth={1.9} aria-hidden />
        Sign in
      </Link>
    </span>
  );

  return (
    <div className="flex flex-1 flex-col gap-1">
      <nav
        className="flex flex-col gap-1 md:flex-row md:items-center md:gap-1.5"
        aria-label="Main"
      >
        {PUBLIC_LINKS.map(({ href, label, icon: Icon }) => (
          <NavLink key={href} href={href} current={pathname.startsWith(href)}>
            <Icon size={18} strokeWidth={1.9} aria-hidden />
            {label}
          </NavLink>
        ))}

        <span className="my-1 h-px w-full bg-rule md:hidden" aria-hidden />
        {account}
      </nav>

      {/* An account waiting on an administrator has a session and no rights.
          Saying so here is the difference between "the site is broken" and
          "somebody has to press a button". */}
      {profile?.role === 'pending' && (
        <p className="mt-1 rounded-full bg-accent-wash px-4 py-2 text-sm text-caution md:mt-2">
          Your account is waiting for an administrator to approve it. Until then you see the archive
          as any visitor does.
        </p>
      )}

      {approved && (
        <nav
          className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-rule pt-2 md:mt-2"
          aria-label="Archive administration"
        >
          <span className="eyebrow mr-2 hidden md:inline">Archive</span>
          <QuietLink href="/review" current={pathname.startsWith('/review')}>
            <ClipboardCheck size={16} strokeWidth={1.9} aria-hidden />
            Review
            {queueCount > 0 && (
              <span
                className="ml-1 rounded-full bg-accent-strong px-2 py-0.5 font-mono text-xs leading-none text-paper"
                aria-label={`${queueCount} waiting`}
              >
                {queueCount}
              </span>
            )}
          </QuietLink>
          <QuietLink href="/manage/vocabulary" current={pathname.startsWith('/manage/vocabulary')}>
            <BookMarked size={16} strokeWidth={1.9} aria-hidden />
            Keywords
          </QuietLink>
          <QuietLink href="/manage/families" current={pathname.startsWith('/manage/families')}>
            <Users size={16} strokeWidth={1.9} aria-hidden />
            Families
          </QuietLink>
          {isAdmin && (
            <QuietLink href="/manage/accounts" current={pathname.startsWith('/manage/accounts')}>
              <ShieldCheck size={16} strokeWidth={1.9} aria-hidden />
              Accounts
            </QuietLink>
          )}
        </nav>
      )}
    </div>
  );
}

function NavLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={[
        'flex h-[46px] items-center gap-2 rounded-full px-4 transition-all duration-200',
        current
          ? 'bg-sage-wash font-semibold text-sage shadow-[inset_0_0_0_1px_var(--color-sage)]'
          : 'text-muted hover:bg-paper-2 hover:text-ink',
      ].join(' ')}
    >
      {children}
    </Link>
  );
}

/** The second row. Same target height on a phone, quieter everywhere. */
function QuietLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={[
        'flex h-11 items-center gap-2 rounded-full px-3.5 text-sm transition-all duration-200',
        current
          ? 'bg-sage-wash font-semibold text-sage'
          : 'text-muted hover:bg-paper-2 hover:text-ink',
      ].join(' ')}
    >
      {children}
    </Link>
  );
}
