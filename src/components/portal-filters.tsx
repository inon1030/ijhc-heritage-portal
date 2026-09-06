'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LayoutGrid, List, Mail, Search, SlidersHorizontal, X } from 'lucide-react';
import { COMMUNITY_COLORS } from '@/lib/communities';
import { CATEGORIES, COMMUNITIES, type Community, type ItemCategory } from '@/lib/types';
import { useMessages } from '@/lib/i18n/provider';
import { categoryKey, communityKey } from '@/lib/i18n/labels';
import { cn } from '@/lib/utils';

/**
 * Everything that narrows the archive, in one bar, above the pictures.
 *
 * ── what this replaced, and why ─────────────────────────────────────────────
 *
 * Measured on the deployed portal at 1440×900: the first photograph began at
 * **1067px** and **none of the eight** were above the fold. The chrome ahead of
 * it came to roughly 950px — a 269px headline block, a 152px contributor
 * search, a 186px panel of four stream cards, a 126px search-and-filter card,
 * and a count line. Four separate boxes, each explaining itself, in front of an
 * archive whose entire argument is the photographs.
 *
 * Three of those were saying the same thing in different shapes. The four
 * stream cards were counts you could click; the filter card was chips you could
 * click; the contributor search was a box you could type in. They are all one
 * question — *show me less* — so they are one bar.
 *
 * ── the counts live on the filters ──────────────────────────────────────────
 *
 * The stream panel is gone and its numbers are not: each stream chip carries
 * its own count, so the shape of the archive is still legible at a glance and
 * costs a line rather than a panel. A stream with nothing in it is shown and
 * disabled — Bnei Menashe holds zero, and hiding that would quietly retire one
 * of the four streams the archive is named for.
 *
 * ── the text fields are secondary on purpose ────────────────────────────────
 *
 * Asked for: filters rather than a search box. The two typed filters are folded
 * behind "More filters" so the default state is a row of chips — the archive
 * offering what it holds, instead of an empty box asking what you already know
 * to look for. They stay open once used, because a filter you cannot see is a
 * filter you will forget you set.
 */

export interface FilterCounts {
  communities: Record<Community, number>;
  categories: Record<string, number>;
}

export function PortalFilters({
  view,
  counts,
  shown,
  total,
}: {
  view: string;
  counts: FilterCounts;
  shown: number;
  total: number;
}) {
  const t = useMessages();
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const community = params.get('community');
  const category = params.get('category');
  const query = params.get('q') ?? '';
  const contributor = params.get('contributor') ?? '';

  const [text, setText] = useState(query);
  const [email, setEmail] = useState(contributor);
  // Open if anything typed is already in play, so a filter is never in force
  // while its box is hidden.
  const [expanded, setExpanded] = useState(Boolean(query || contributor));

  const active = Boolean(community || category || query || contributor);

  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    startTransition(() => router.push(`/portal?${next.toString()}`, { scroll: false }));
  }

  return (
    <div className="border-b border-rule pb-3">
      {/*
        One scrolling line on a phone, wrapping from `sm` up.
        
        Eight chips wrapped to four rows at 375px and took 250px of a 812px
        screen — the exact fault this bar was built to remove, reappearing one
        breakpoint down. A filter row that scrolls sideways is a pattern people
        already know from every photo app they use.
      */}
      <div className="-mx-6 flex items-center gap-x-2 gap-y-2 overflow-x-auto px-6 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
        {/* The streams, with their counts. One line where a panel used to be. */}
        {COMMUNITIES.map((c) => {
          const n = counts.communities[c] ?? 0;
          const on = community === c;
          return (
            <button
              key={c}
              type="button"
              disabled={n === 0 && !on}
              aria-pressed={on}
              onClick={() => apply({ community: on ? null : c })}
              className={cn(
                'flex h-9 shrink-0 items-center gap-2 rounded-full border ps-2.5 pe-3 text-sm transition-all duration-200',
                on
                  ? 'border-transparent bg-ink text-paper shadow-soft'
                  : 'border-rule hover:border-accent-strong hover:bg-accent-wash',
                n === 0 && !on && 'cursor-default opacity-40 hover:border-rule hover:bg-transparent',
              )}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: COMMUNITY_COLORS[c] }}
              />
              {t(communityKey(c))}
              <span className={cn('machine text-xs', on ? 'text-paper/70' : 'text-muted')}>{n}</span>
            </button>
          );
        })}

        <span className="mx-1 hidden h-6 w-px bg-rule sm:block" aria-hidden />

        {CATEGORIES.map((c) => {
          const on = category === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => apply({ category: on ? null : (c as ItemCategory) })}
              className={cn(
                'h-9 shrink-0 rounded-full border px-3 text-sm transition-all duration-200',
                on
                  ? 'border-transparent bg-ink text-paper shadow-soft'
                  : 'border-rule hover:border-accent-strong hover:bg-accent-wash',
              )}
            >
              {t(categoryKey(c as ItemCategory))}
            </button>
          );
        })}

        <div className="ms-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
              expanded || query || contributor
                ? 'border-accent-strong bg-accent-wash'
                : 'border-rule text-muted hover:text-ink',
            )}
          >
            <SlidersHorizontal size={14} />
            <span className="hidden sm:inline">
              {expanded ? t('filters.fewer') : t('filters.more')}
            </span>
          </button>

          <div className="flex gap-0.5 rounded-full border border-rule p-0.5">
            <ViewToggle
              on={view === 'grid'}
              label={t('controls.viewNamed', { view: t('controls.grid') })}
              onSelect={() => apply({ view: null })}
            >
              <LayoutGrid size={15} />
            </ViewToggle>
            <ViewToggle
              on={view === 'list'}
              label={t('controls.viewNamed', { view: t('controls.list') })}
              onSelect={() => apply({ view: 'list' })}
            >
              <List size={15} />
            </ViewToggle>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Typed
            icon={<Search size={14} />}
            value={text}
            onChange={setText}
            onCommit={() => apply({ q: text.trim() || null })}
            placeholder={t('filters.text')}
          />
          <Typed
            icon={<Mail size={14} />}
            value={email}
            onChange={setEmail}
            onCommit={() => apply({ contributor: email.trim() || null })}
            placeholder={t('filters.contributor')}
            ltr
          />
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-3">
        <p className="eyebrow" aria-live="polite">
          {pending ? t('controls.updating') : t('filters.showing', { shown, total })}
        </p>
        {active && (
          <button
            type="button"
            onClick={() => {
              setText('');
              setEmail('');
              startTransition(() => router.push('/portal', { scroll: false }));
            }}
            className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-critical"
          >
            <X size={13} /> {t('filters.clear')}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A typed filter, committed on Enter or on leaving the field.
 *
 * Not on every keystroke: each commit is a navigation and a server render, and
 * an address typed a character at a time would be twenty of them — plus, for
 * the contributor field, twenty lookups against a table that is not the
 * visitor's to browse.
 */
function Typed({
  icon,
  value,
  onChange,
  onCommit,
  placeholder,
  ltr = false,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  placeholder: string;
  ltr?: boolean;
}) {
  return (
    <div className="relative min-w-52 flex-1 sm:max-w-64">
      <span className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-muted">
        {icon}
      </span>
      <input
        value={value}
        dir={ltr ? 'ltr' : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => e.key === 'Enter' && onCommit()}
        placeholder={placeholder}
        className="h-9 w-full rounded-full border border-rule bg-paper-2/60 ps-8 pe-3 text-sm placeholder:text-muted/70 focus:border-accent-strong focus:bg-paper focus:outline-none"
      />
    </div>
  );
}

function ViewToggle({
  on,
  label,
  onSelect,
  children,
}: {
  on: boolean;
  label: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={on}
      aria-label={label}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
        on ? 'bg-ink text-paper' : 'text-muted hover:bg-paper-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
