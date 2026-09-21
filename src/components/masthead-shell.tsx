'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useMessages } from '@/lib/i18n/provider';
import type { Profile } from '@/lib/types';
import { AccountNav, ArchiveNav, PendingNotice, PrimaryNav } from '@/components/site-nav';

/**
 * The bar across the top of every page.
 *
 * Rebuilt 21.09.2026 to elevenlabs.io's proportions: a 64px bar on the page's
 * own paper, the mark and the name at the start, the navigation in plain words
 * beside it, the account at the far end. Nothing folds and nothing opens on
 * hover - the Center asked for a menu that is bigger and clearer, and the
 * clearest menu is one that is already open.
 *
 * Below `lg:` there is no room for all of it, so the words go behind one
 * button that opens a panel under the bar. The panel renders the same three
 * groups as the bar (see `site-nav.tsx`), so the phone and the desktop cannot
 * offer different things.
 *
 * An approved knowledge expert gets a second, quieter row for the archive's own
 * tools, so they never compete with the three things everyone else came for.
 *
 * Logical properties throughout - `start`/`end`, `ms`/`me` - because in Hebrew
 * the whole bar mirrors.
 */
export function MastheadShell({
  home,
  rule,
  language,
  profile,
  queueCount,
}: {
  /** The mark and the Center's name, as a link home. */
  home: React.ReactNode;
  /** The proportional stream rule: four pixels, the archive's signature. */
  rule: React.ReactNode;
  /** The theme and language controls, visible at every width. */
  language: React.ReactNode;
  profile: Profile | null;
  queueCount: number;
}) {
  const t = useMessages();
  const pathname = usePathname();
  // The page the menu was opened on. Navigating anywhere else closes it, with
  // no effect needed: the menu is open only while that is still the page.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const header = useRef<HTMLElement>(null);
  const approved = profile?.role === 'volunteer' || profile?.role === 'admin';

  // Escape or a tap outside closes the phone menu too.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!header.current?.contains(e.target as Node)) setOpenOn(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenOn(null);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <header ref={header} className="sticky top-0 z-40 bg-paper/92 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-6">
        <div className="shrink-0">{home}</div>

        <div className="hidden lg:block">
          <PrimaryNav layout="bar" />
        </div>

        <div className="ms-auto flex items-center gap-2">
          {language}
          <div className="hidden items-center gap-2 lg:flex">
            <AccountNav profile={profile} layout="bar" />
          </div>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="masthead-panel"
            aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
            onClick={() => setOpenOn(open ? null : pathname)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-rule-strong text-ink transition-colors hover:bg-surface lg:hidden"
          >
            {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>
      </div>

      {(approved || profile?.role === 'pending') && (
        <div className="hidden border-t border-rule lg:block">
          <div className="mx-auto flex min-h-12 max-w-6xl items-center gap-4 px-6 py-1.5">
            <ArchiveNav profile={profile} queueCount={queueCount} layout="bar" />
            <PendingNotice profile={profile} />
          </div>
        </div>
      )}

      {rule}

      {open && (
        <div
          id="masthead-panel"
          className="absolute inset-x-0 top-full max-h-[calc(100dvh-4.25rem)] overflow-y-auto border-b border-rule bg-paper shadow-lift lg:hidden"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-4">
            <PrimaryNav layout="panel" />
            <ArchiveNav profile={profile} queueCount={queueCount} layout="panel" />
            <PendingNotice profile={profile} />
            <div className="border-t border-rule pt-3">
              <AccountNav profile={profile} layout="panel" />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
