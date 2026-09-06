'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { LayoutGrid, List, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORIES, COMMUNITIES } from '@/lib/types';
import { COMMUNITY_COLORS } from '@/lib/communities';
import { useMessages } from '@/lib/i18n/provider';
import { categoryKey, communityKey } from '@/lib/i18n/labels';

/**
 * Filters live in the URL, so a search is a link: shareable, bookmarkable, and
 * survives a refresh. The demo held all of this in component state and lost it
 * the moment you navigated away.
 */
export function PortalControls({ view }: { view: 'grid' | 'list' }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.get('q') ?? '');

  const category = params.get('category');
  const community = params.get('community');

  function apply(next: Record<string, string | null>) {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) search.set(key, value);
      else search.delete(key);
    }
    startTransition(() => router.push(`/portal?${search.toString()}`, { scroll: false }));
  }

  // Debounce typing so every keystroke is not a navigation.
  useEffect(() => {
    const current = params.get('q') ?? '';
    if (query === current) return;
    const timer = setTimeout(() => apply({ q: query || null }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const t = useMessages();
  const hasFilters = Boolean(category || community || params.get('q'));

  return (
    <div className="card space-y-5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search
            size={19}
            className="absolute top-1/2 left-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('controls.searchTitles')}
            aria-label={t('controls.search')}
            className="h-14 w-full rounded-full card bg-paper-2/60 pr-4 pl-12 placeholder:text-muted/70 focus:border-accent-strong focus:bg-paper focus:outline-none"
          />
        </div>

        <div
          className="flex gap-1 rounded-full card bg-paper-2/60 p-1"
          role="group"
          aria-label={t('controls.layout')}
        >
          <ViewToggle
            current={view}
            target="grid"
            label={t('controls.viewNamed', { view: t('controls.grid') })}
            onSelect={() => apply({ view: null })}
          >
            <LayoutGrid size={18} />
          </ViewToggle>
          <ViewToggle
            current={view}
            target="list"
            label={t('controls.viewNamed', { view: t('controls.list') })}
            onSelect={() => apply({ view: 'list' })}
          >
            <List size={18} />
          </ViewToggle>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-1 w-full sm:w-auto">{t('controls.community')}</span>
        {COMMUNITIES.map((c) => (
          <Chip
            key={c}
            active={community === c}
            color={COMMUNITY_COLORS[c]}
            onClick={() => apply({ community: community === c ? null : c })}
          >
            {t(communityKey(c))}
          </Chip>
        ))}

        <span className="eyebrow mr-1 w-full sm:ml-4 sm:w-auto">{t('controls.type')}</span>
        {CATEGORIES.map((c) => (
          <Chip key={c} active={category === c} onClick={() => apply({ category: category === c ? null : c })}>
            {t(categoryKey(c))}
          </Chip>
        ))}

        {hasFilters && (
          <button
            onClick={() => {
              setQuery('');
              startTransition(() => router.push('/portal', { scroll: false }));
            }}
            className="ml-2 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted transition-colors hover:bg-paper-2 hover:text-critical"
          >
            <X size={14} /> {t('controls.clearAll')}
          </button>
        )}

        {pending && <span className="eyebrow ml-auto">{t('controls.updating')}</span>}
      </div>
    </div>
  );
}

function Chip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium',
        'transition-all duration-200 hover:-translate-y-0.5',
        active
          ? 'border-transparent bg-ink text-paper shadow-soft'
          : 'border-rule bg-paper text-ink hover:border-accent-strong hover:bg-accent-wash',
      )}
    >
      {color && (
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-full ring-2 ring-paper/40"
          style={{ backgroundColor: color }}
        />
      )}
      {children}
    </button>
  );
}

function ViewToggle({
  current,
  target,
  label,
  onSelect,
  children,
}: {
  current: string;
  target: string;
  /** Already translated by the caller — this is not a place to build a
      sentence out of a noun and the word "view". */
  label: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  const active = current === target;
  return (
    <button
      onClick={onSelect}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        'flex h-12 w-12 items-center justify-center rounded-full transition-all duration-200',
        active ? 'bg-ink text-paper shadow-soft' : 'text-muted hover:bg-paper-3 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
