'use client';

import { useMessages } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';

/**
 * "How accurate was the AI's reading?" — one optional answer, 1 to 5.
 *
 * Michal (24.09.2026). Five plain numbered buttons rather than stars: stars
 * read as "how much did you like it", and the question is whether the machine
 * got the item right. The two ends carry words so nobody has to guess which
 * way the scale runs. Pressing the chosen number again takes the answer back.
 */
export function AiRating({
  value,
  onChange,
  disabled = false,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}) {
  const t = useMessages();

  return (
    <fieldset className="mb-5 rounded-2xl bg-surface p-4" disabled={disabled}>
      <legend className="sr-only">{t('rating.question')}</legend>
      <p className="eyebrow mb-1.5" aria-hidden>
        {t('rating.question')}
      </p>
      <p className="mb-3 text-sm text-muted">{t('rating.why')}</p>
      <div className="flex gap-2" role="group">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onChange(value === n ? null : n)}
            className={cn(
              'h-12 min-w-12 flex-1 rounded-lg border text-lg font-medium transition-colors duration-200 sm:flex-none sm:px-5',
              value === n
                ? 'border-accent-strong bg-accent-strong text-paper'
                : 'border-rule bg-paper hover:border-accent-strong',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="mt-1.5 flex justify-between gap-3 text-sm text-muted sm:max-w-[21rem]">
        <span>{t('rating.low')}</span>
        <span>{t('rating.high')}</span>
      </p>
    </fieldset>
  );
}
