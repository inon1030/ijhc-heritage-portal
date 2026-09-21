'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookMarked,
  BookOpen,
  ClipboardCheck,
  Globe,
  LogIn,
  LogOut,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import type { Profile } from '@/lib/types';
import { useMessages } from '@/lib/i18n/provider';

/**
 * Everything the site can do, laid out in the bar at the top of every page.
 *
 * Until 21.09.2026 this lived behind a folded strip that opened on hover. The
 * Center asked twice for a menu that is bigger and clearer, and a menu you
 * have to discover is neither. On elevenlabs.io the navigation is simply
 * there: the mark, a handful of words, the account at the far end. So is this.
 *
 * Three groups, each rendered in two layouts - `bar` across the top from `lg:`
 * up, `panel` stacked in the phone menu - so the two can never drift apart:
 *
 * - **Primary**: what anybody can do. Portal, Contribute, and the guides, with
 *   the book the Center asked for.
 * - **Account**: sign in and ask for an account, or sign out.
 * - **Archive**: what an approved knowledge expert maintains. Only rendered for
 *   an approved account; RLS and the routes enforce the same line regardless.
 */

export interface NavProps {
  /**
   * Null when nobody is signed in. Present but role 'pending' when the account
   * exists and has not been approved - which is why this is the whole profile
   * and not just an address.
   */
  profile: Profile | null;
  queueCount: number;
}

type Layout = 'bar' | 'panel';

const PRIMARY = [
  { href: '/portal', key: 'nav.portal', icon: Globe },
  { href: '/upload', key: 'nav.contribute', icon: Upload },
  { href: '/guides', key: 'nav.guides', icon: BookOpen },
] as const;

export function PrimaryNav({ layout }: { layout: Layout }) {
  const t = useMessages();
  const pathname = usePathname();
  return (
    <nav
      aria-label={t('nav.main')}
      className={layout === 'bar' ? 'flex items-center gap-1' : 'flex flex-col gap-1'}
    >
      {PRIMARY.map(({ href, key, icon: Icon }) => {
        const current = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={[
              'flex items-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors duration-200',
              layout === 'bar' ? 'h-10 px-4 text-[0.9375rem]' : 'h-12 px-4 text-base',
              current ? 'bg-surface-2 text-ink' : 'text-muted hover:bg-surface hover:text-ink',
            ].join(' ')}
          >
            <Icon size={18} strokeWidth={1.8} aria-hidden />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}

export function AccountNav({ profile, layout }: { profile: Profile | null; layout: Layout }) {
  const t = useMessages();

  if (profile) {
    return (
      <form action="/api/auth/signout" method="post">
        <button
          type="submit"
          title={t('nav.signedInAs', { email: profile.email })}
          className={[
            'flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-rule-strong font-medium text-muted transition-colors duration-200 hover:border-critical/40 hover:text-critical',
            layout === 'bar' ? 'h-9 px-4 text-sm' : 'h-12 w-full px-4',
          ].join(' ')}
        >
          <LogOut size={16} strokeWidth={1.8} aria-hidden />
          {t('nav.signOut')}
        </button>
      </form>
    );
  }

  // Signing in and asking for an account are two different intentions, and
  // one link labelled "Volunteer sign in" hid the second behind a tab nobody
  // knew was there.
  return (
    <div className={layout === 'bar' ? 'flex items-center gap-1.5' : 'flex flex-col gap-2'}>
      <Link
        href="/login?mode=request"
        className={[
          'flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium text-muted transition-colors duration-200 hover:bg-surface hover:text-ink',
          layout === 'bar' ? 'h-9 px-3.5 text-sm' : 'h-12 px-4',
        ].join(' ')}
      >
        <UserPlus size={16} strokeWidth={1.8} aria-hidden />
        {t('nav.createAccount')}
      </Link>
      <Link
        href="/login"
        className={[
          'flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary font-medium text-white transition-colors duration-200 hover:bg-primary-strong',
          layout === 'bar' ? 'h-9 px-4 text-sm' : 'h-12 px-4',
        ].join(' ')}
      >
        <LogIn size={16} strokeWidth={1.8} aria-hidden />
        {t('nav.signIn')}
      </Link>
    </div>
  );
}

export function ArchiveNav({ profile, queueCount, layout }: NavProps & { layout: Layout }) {
  const t = useMessages();
  const pathname = usePathname();
  const approved = profile?.role === 'volunteer' || profile?.role === 'admin';
  if (!approved) return null;
  const isAdmin = profile?.role === 'admin';

  const links = [
    { href: '/review', label: t('nav.review'), icon: ClipboardCheck, count: queueCount },
    { href: '/manage/vocabulary', label: t('nav.keywords'), icon: BookMarked },
    { href: '/manage/families', label: t('nav.families'), icon: Users },
    ...(isAdmin
      ? [
          { href: '/manage/accounts', label: t('nav.accounts'), icon: ShieldCheck },
          { href: '/manage/bin', label: t('nav.bin'), icon: Trash2 },
        ]
      : []),
  ];

  return (
    <nav
      aria-label={t('nav.archiveAdmin')}
      className={layout === 'bar' ? 'flex flex-wrap items-center justify-center gap-1' : 'flex flex-col gap-1'}
    >
      <span className={layout === 'bar' ? 'eyebrow me-2' : 'eyebrow px-4 pb-1 pt-2'}>{t('nav.archive')}</span>
      {links.map(({ href, label, icon: Icon, count }) => {
        const current = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={[
              'flex items-center gap-2 whitespace-nowrap rounded-full transition-colors duration-200',
              layout === 'bar' ? 'h-9 px-3.5 text-sm' : 'h-12 px-4',
              current ? 'bg-surface-2 font-medium text-ink' : 'text-muted hover:bg-surface hover:text-ink',
            ].join(' ')}
          >
            <Icon size={16} strokeWidth={1.8} aria-hidden />
            {label}
            {count ? (
              <span
                className="ms-0.5 rounded-full bg-accent-strong px-2 py-0.5 font-mono text-xs leading-none text-paper"
                aria-label={t('nav.waiting', { count })}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * An account waiting on an administrator has a session and no rights. Saying
 * so is the difference between "the site is broken" and "somebody has to press
 * a button".
 */
export function PendingNotice({ profile }: { profile: Profile | null }) {
  const t = useMessages();
  if (profile?.role !== 'pending') return null;
  return <p className="rounded-full bg-accent-wash px-4 py-2 text-sm text-caution">{t('nav.pendingAccount')}</p>;
}
