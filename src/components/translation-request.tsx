'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Asks for a translation that does not exist yet, then gets out of the way.
 *
 * It renders nothing but a line of status. All the rendering is on the server:
 * the page draws from `item_translations`, and this component's only job is to
 * cause the missing rows to exist and then ask the page to draw again. One code
 * path for the record page, whether the translation was made a moment ago or a
 * year ago.
 *
 * **Nobody waits for it.** The record is already on screen, in the language it
 * was written in, before this runs. Measured against the free tier the first
 * translation of a record takes between two and forty seconds — the model
 * answers 503 under load and this waits it out — so blocking the page on it
 * would mean an archive that is sometimes simply unavailable in Hebrew. Instead
 * the reader reads, and the translation arrives when it arrives. If they have
 * gone by then it is still stored, and the next reader has it at once.
 *
 * ── one call, and the answer still arrives ─────────────────────────────────
 *
 * React mounts a component twice in development, so a naive effect makes two
 * model calls for one record. The obvious guard — a ref saying "already asked",
 * plus a cleanup that ignores a late answer — is worse than the problem, and it
 * shipped that way for about ten minutes: the first mount fired the request and
 * its cleanup then discarded the result, and the second mount saw the guard and
 * never asked again. The line read "Translating into Marathi…" for good while
 * the finished Marathi sat in the database, one refresh away.
 *
 * What is held on the ref is the *promise*, not a flag. The second mount finds
 * the request already in flight, makes no new one, and waits on the same answer
 * as the first.
 */
export function TranslationRequest({
  itemId,
  lang,
  label,
}: {
  itemId: string;
  lang: string;
  /** The language's own name, for the one line this shows while it works. */
  label: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<'working' | 'unavailable' | 'done'>('working');
  const inflight = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    inflight.current ??= (async () => {
      try {
        const response = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ itemId, lang }),
        });
        const body = await response.json();
        return response.ok && body?.ok === true && !body.data?.unavailable;
      } catch {
        return false;
      }
    })();

    let live = true;
    inflight.current.then((made) => {
      if (!live) return;
      setState(made ? 'done' : 'unavailable');
      // The rows exist now. Let the server render the page from them.
      if (made) router.refresh();
    });

    return () => {
      live = false;
    };
  }, [itemId, lang, router]);

  if (state === 'done') return null;

  return (
    <p className="mt-4 text-sm text-muted" aria-live="polite">
      {state === 'working'
        ? `Translating into ${label}…`
        : `Not available in ${label} yet. Showing the record as it was written.`}
    </p>
  );
}
