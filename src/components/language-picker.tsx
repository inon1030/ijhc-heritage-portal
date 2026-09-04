'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Languages } from 'lucide-react';

/**
 * The reader's choice of language.
 *
 * Sits beside the menu prompt on the strip, so it is reachable from every page
 * without opening anything, and it says which language you are in — the one
 * question a picker has to answer before you have clicked it.
 *
 * ── three things it does not do ─────────────────────────────────────────────
 *
 * **It is not a `<select>`.** Every language is written in its own script, and
 * a native select renders its options in the operating system's font stack, not
 * the page's — which is precisely the tofu the archive just finished fixing.
 * These are buttons in the document, drawn with the Noto faces the site loads.
 *
 * **It does not translate the interface.** It asks for the *records* in a
 * language. The interface stays English (ADR-009); a reader wanting a Hebrew
 * catalogue entry is not the same request as a reader wanting a Hebrew Submit
 * button, and the archive can do the first honestly today.
 *
 * **It is not in the URL.** A record's address is permanent — it is cited, it is
 * linked, and the receipt a contributor keeps points at one — so the language
 * is a cookie on the reader, not a fork of every address in the archive.
 */

export interface PickableLanguage {
  code: string;
  label_en: string;
  label_native: string;
  rtl: boolean;
}

export function LanguagePicker({
  languages,
  current,
}: {
  languages: PickableLanguage[];
  current: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = languages.find((l) => l.code === current) ?? languages[0];
  if (!active || languages.length < 2) return null;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Reading in ${active.label_en}. Choose a language.`}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-1.5 rounded-full border border-rule px-2.5 text-muted transition-colors hover:border-accent hover:text-ink"
      >
        <Languages size={15} aria-hidden />
        <span className="eyebrow text-[0.7rem]">{active.code}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-50 w-56 overflow-hidden rounded-xl border border-rule bg-paper shadow-lift"
        >
          <p className="border-b border-rule px-4 py-2.5 text-xs leading-snug text-muted">
            Read the records in
          </p>
          {languages.map((language) => {
            const chosen = language.code === active.code;
            return (
              <button
                key={language.code}
                role="menuitemradio"
                aria-checked={chosen}
                type="button"
                disabled={pending !== null}
                onClick={() => {
                  if (chosen) return setOpen(false);
                  setPending(language.code);
                  choose(language.code);
                }}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-paper-2 disabled:opacity-60"
              >
                <span className="flex flex-col">
                  {/* Its own name, in its own script and its own direction —
                      a picker that says "Hebrew" to somebody who reads only
                      Hebrew has not helped them. */}
                  <span dir={language.rtl ? 'rtl' : 'ltr'} className="text-[0.95rem] text-ink">
                    {language.label_native}
                  </span>
                  <span className="text-xs text-muted">{language.label_en}</span>
                </span>
                {chosen && <Check size={15} className="shrink-0 text-accent" aria-hidden />}
                {pending === language.code && (
                  <span className="eyebrow shrink-0 text-[0.65rem] text-muted">…</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Written from module scope, not from inside the component.
 *
 * `document.cookie = …` during a render is a side effect on a global, which the
 * React compiler refuses — and rightly: it would run again on every re-render.
 * A full reload rather than a router refresh, because the language is read on
 * the server while rendering and every cached segment of the page is now in the
 * wrong language.
 */
function choose(code: string) {
  const year = 60 * 60 * 24 * 365;
  document.cookie = `ijhc.lang=${encodeURIComponent(code)}; path=/; max-age=${year}; samesite=lax`;
  window.location.reload();
}
