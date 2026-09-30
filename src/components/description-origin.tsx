'use client';

import { useMemo, useState } from 'react';
import { Pencil, Sparkles } from 'lucide-react';
import { useMessages } from '@/lib/i18n/provider';
import { provenance } from '@/lib/text/word-diff';

/**
 * The user's description, with what was the AI's and what was theirs.
 *
 * Michal (24.09.2026). The upload screen pre-fills the description with the
 * AI's summary, so "what the user said" was often the machine's words, and a
 * knowledge expert could not tell. Now it says which, and when the user edited
 * the AI text, their own words are marked in place — the words the reviewer
 * should weigh as testimony rather than as a reading of the file.
 */
export function DescriptionOrigin({
  person,
  machine,
}: {
  person: string;
  machine: string | null | undefined;
}) {
  const t = useMessages();
  const [showAi, setShowAi] = useState(false);
  const result = useMemo(() => provenance(machine, person), [machine, person]);

  if (result.kind === 'none') return null;

  return (
    <div>
      {result.kind === 'edited' ? (
        <p className="leading-relaxed" dir="auto">
          {result.pieces.map((piece, index) =>
            piece.origin === 'person' ? (
              <mark
                key={index}
                className="rounded-sm bg-accent-wash px-0.5 text-ink underline decoration-accent-strong decoration-2 underline-offset-4"
              >
                {piece.text}
              </mark>
            ) : (
              <span key={index}>{piece.text}</span>
            ),
          )}
        </p>
      ) : (
        <p className="leading-relaxed" dir="auto">
          {person}
        </p>
      )}

      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5">
          {result.kind === 'own' ? <Pencil size={13} aria-hidden /> : <Sparkles size={13} aria-hidden />}
          {result.kind === 'unchanged' && t('wb.origin.unchanged')}
          {result.kind === 'own' && t('wb.origin.own')}
          {result.kind === 'edited' &&
            t('wb.origin.edited', { added: result.added, removed: result.removed })}
        </span>
        {result.kind === 'edited' && (
          <button
            type="button"
            onClick={() => setShowAi((open) => !open)}
            aria-expanded={showAi}
            className="underline underline-offset-2 hover:text-ink"
          >
            {t(showAi ? 'wb.origin.hideAi' : 'wb.origin.showAi')}
          </button>
        )}
      </p>
      {result.kind === 'edited' && (
        <p className="mt-1 text-sm text-muted">{t('wb.origin.legend')}</p>
      )}
      {showAi && machine && (
        <p className="machine mt-2 rounded-md border border-rule bg-paper px-3 py-2 text-sm leading-relaxed" dir="auto">
          {machine}
        </p>
      )}
    </div>
  );
}
