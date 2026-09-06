'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { useMessages } from '@/lib/i18n/provider';

/**
 * Everything one person sent, found by the address they left.
 *
 * Drawn only for a volunteer, and the query behind it refuses without one —
 * because a control that is merely hidden is not a permission. The note under
 * the box is not decoration either: every contributor ticks a box saying their
 * address cannot be used to look up their uploads, and the volunteer using
 * this should know that promise is what bounds it.
 */
export function ContributorSearch({ current }: { current: string }) {
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
      <p className="mt-2 text-xs leading-relaxed text-muted">{t('contributor.volunteersOnly')}</p>
    </div>
  );
}
