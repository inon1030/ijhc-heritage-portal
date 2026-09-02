'use client';

import { useEffect } from 'react';

/**
 * The most likely cause by far is an unconfigured or unreachable Supabase
 * project, so the message says that rather than "something went wrong".
 */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-6 py-24">
      <p className="eyebrow">Error</p>
      <h1 className="mt-3 font-display text-3xl">The archive could not be reached</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        This usually means the database is not configured yet. Check that{' '}
        <code className="machine">.env.local</code> holds a real Supabase URL and keys, and that the
        migrations in <code className="machine">supabase/migrations/</code> have been applied.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Setup steps are in <code className="machine">README.md</code>.
      </p>
      <button
        onClick={reset}
        className="mt-8 bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:bg-ink-2"
      >
        Try again
      </button>
    </div>
  );
}
