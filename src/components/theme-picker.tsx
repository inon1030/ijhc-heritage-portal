'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { useMessages } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import type { Theme } from '@/lib/theme';

const ORDER: Theme[] = ['system', 'light', 'dark'];

/**
 * Three states behind one button.
 *
 * A two-state switch cannot say "follow my system", which is what most people
 * want and what the archive does until told otherwise. Cycling through three is
 * a single target on a phone rather than a menu — and the label under it always
 * names the state it is in, so nobody has to learn an icon.
 *
 * The stamp is written straight onto `<html>` so the page turns immediately,
 * and into a cookie so the server renders the next page the same way.
 */
export function ThemePicker({ initial, className }: { initial: Theme; className?: string }) {
  const t = useMessages();
  const [theme, setTheme] = useState<Theme>(initial);

  function choose(next: Theme) {
    setTheme(next);
    const root = document.documentElement;
    if (next === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', next);

    // A year, on this site only, and nothing personal in it.
    document.cookie = `ijhc.theme=${next === 'system' ? '' : next}; path=/; max-age=${next === 'system' ? 0 : 31536000}; samesite=lax`;
  }

  const label = { system: t('theme.system'), light: t('theme.light'), dark: t('theme.dark') }[theme];
  const Icon = { system: Monitor, light: Sun, dark: Moon }[theme];

  return (
    <button
      type="button"
      onClick={() => choose(ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length])}
      title={t('theme.change')}
      aria-label={`${t('theme.change')} — ${label}`}
      className={cn(
        'flex h-9 items-center gap-1.5 rounded-full border border-rule bg-paper px-3 text-sm text-muted transition-colors hover:border-accent-strong hover:text-ink',
        className,
      )}
    >
      <Icon size={16} strokeWidth={1.9} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
