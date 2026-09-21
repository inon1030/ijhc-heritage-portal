'use client';

import { ExternalLink } from 'lucide-react';
import { useMessages } from '@/lib/i18n/provider';
import type { Background } from '@/lib/ai/background';

/**
 * The reading's unverified background, under its own heading.
 *
 * Deliberately a folded panel with no "use this" button, unlike every other
 * suggestion on these screens: the rest of the reading names what it rests on,
 * and this does not. Whoever wants a sentence of it has to read it, check it,
 * and type it themselves. See src/lib/ai/background.ts.
 */
export function BackgroundNote({ background }: { background: Background | null }) {
  const t = useMessages();
  if (!background) return null;

  return (
    <details className="mt-3 card bg-paper-2/50">
      <summary className="eyebrow cursor-pointer px-4 py-3">{t('bg.heading')}</summary>
      <div className="border-t border-rule px-4 py-3">
        <p className="mb-3 text-sm text-muted">{t('bg.explain')}</p>
        <p dir="auto" className="whitespace-pre-line leading-relaxed">
          {background.text}
        </p>
        {background.sources.length > 0 && (
          <>
            <p className="eyebrow mt-4 mb-1.5">{t('bg.sources')}</p>
            <ul className="space-y-1 text-sm">
              {background.sources.map((source) => (
                <li key={source.url}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 underline decoration-rule underline-offset-2 hover:decoration-accent-strong"
                  >
                    {source.title}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}
