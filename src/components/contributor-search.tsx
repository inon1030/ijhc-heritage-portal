'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { useMessages } from '@/lib/i18n/provider';

/**
 * Everything one person sent, found by the address they left.
 *
 * Open to anyone, and it returns only what is already public — the same rows a
 * visitor could reach by scrolling, grouped by who sent them. That is what
 * makes it useful to a family who contributed a dozen photographs and has no
 * account to find them with.
 *
 * A volunteer gets more: material still in review, held back, or declined. The
 * server decides that, not this component — a control that is merely hidden is
 * not a permission.
 *
 * The note under the box says which of the two you are getting, because the
 * difference matters and the box looks identical either way.
 */
export function ContributorSearch({
  current,
  volunteer,
}: {
  current: string;
  /** Only changes the note. What is actually returned is decided on the server. */
  volunteer: boolean;
}) {
  const t = useMessages();
  const router = useRouter();
  const [email, setEmail] = useState(current);

  function find() {
    const address = email.trim();
    router.push(address ? `/portal?contributor=${encodeURIComponent(address)}` : '/portal');
  }

  return (
    <div className="card bg-paper-2/50 p-4">
      <label className="eyebrow mb-2 block">{t('contributor.search')}</label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search size={16} className="absolute top-1/2 start-3 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && find()}
            placeholder={t('contributor.placeholder')}
            className="h-11 w-full rounded-full border border-rule bg-paper ps-9 pe-4 focus:border-accent-strong focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={find}
          className="h-11 rounded-full bg-ink px-5 font-medium text-paper transition-colors hover:bg-ink-2"
        >
          {t('contributor.find')}
        </button>
        {current && (
          <button
            type="button"
            onClick={() => router.push('/portal')}
            className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm text-muted hover:text-ink"
          >
            <X size={14} /> {t('contributor.clear')}
          </button>
        )}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        {volunteer ? t('contributor.asVolunteer') : t('contributor.publicOnly')}
      </p>
    </div>
  );
}
