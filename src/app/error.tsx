'use client';

import { useEffect, useState } from 'react';
import { reportProblem } from '@/lib/problems/report';
import { problemCode } from '@/lib/problems/code';
import { useMessages } from '@/lib/i18n/provider';

/**
 * The most likely cause by far is an unconfigured or unreachable Supabase
 * project, so the message says that rather than "something went wrong".
 */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  const t = useMessages();
  // Made once, on the client, so the code on screen is the one reported.
  const [code] = useState(problemCode);
  useEffect(() => {
    console.error(error);
    reportProblem(error, 'app/error', code);
  }, [error, code]);

  return (
    <div className="mx-auto max-w-lg px-6 py-24">
      <p className="eyebrow">{t('error.label')}</p>
      <h1 className="mt-3 font-display text-3xl">{t('error.unreachable')}</h1>
      {/* The two paragraphs below stay in English deliberately. They are
          operator instructions naming files on a server — `.env.local`,
          `README.md` — and they are addressed to whoever runs the archive, not
          to the visitor who happened to arrive while it was down. Translating a
          path helps nobody and translating the sentence around it implies the
          reader is the one who can act on it. */}
      <p className="mt-4 text-sm leading-relaxed text-muted">
        This usually means the database is not configured yet. Check that{' '}
        <code className="machine">.env.local</code> holds a real Supabase URL and keys, and that the
        migrations in <code className="machine">supabase/migrations/</code> have been applied.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Setup steps are in <code className="machine">README.md</code>.
      </p>
      <p className="mt-6 text-sm">
        {t('problem.codeLabel')} <code className="machine select-all">{code}</code>
        <span className="block text-muted">{t('problem.codeHint')}</span>
      </p>
      <button
        onClick={reset}
        className="mt-8 bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-strong"
      >
        {t('error.tryAgain')}
      </button>
    </div>
  );
}
