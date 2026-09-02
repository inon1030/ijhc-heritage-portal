'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { CONSENT_CLAUSES, CONSENT_VERSION, contactSentence } from '@/lib/consent';

/**
 * The agreement, in the shape terms of use actually take: one small line above
 * the button, with the full text a hover away.
 *
 * It sits before **Analyse**, not before Submit, and that is the correct place
 * rather than the convenient one. Analysis is the moment the file leaves the
 * building — it is sent to Google's Gemini service — so agreement has to come
 * before it, not after.
 *
 * Three details, each of which was a bug first:
 *
 * The trigger is not inside the `<label>`. A tap on anything inside a label is
 * forwarded by the browser to the labelled control, so reading the terms also
 * ticked the box.
 *
 * Hover and tap are separated by `pointerType`. A tap synthesises `mouseenter`
 * before the click, so hover-to-open and click-to-toggle fought each other: the
 * enter opened the panel and the click shut it again, in one gesture. On a
 * mouse it looked perfect, which is exactly why it survived a desktop check.
 *
 * The panel hangs off the whole row rather than off the inline link. Centred on
 * the link it ran past the edge of a phone, because the link sits wherever the
 * sentence happens to wrap to.
 */
export function ConsentBlock({
  agreed,
  onChange,
  disabled,
}: {
  agreed: boolean;
  onChange: (agreed: boolean) => void;
  disabled: boolean;
}) {
  const boxId = useId();
  const [open, setOpen] = useState(false);
  const row = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A tap outside, or Escape, puts it away.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!row.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // A grace period, so crossing the gap between the link and the panel does not
  // close the thing you are reaching for.
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 220);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  return (
    <span
      ref={row}
      className="relative flex items-start gap-2.5 text-sm leading-relaxed text-muted"
    >
      <input
        id={boxId}
        type="checkbox"
        checked={agreed}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-[1.15rem] w-[1.15rem] shrink-0 accent-[var(--color-accent-strong)]"
      />

      <span>
        <label htmlFor={boxId} className="cursor-pointer">
          I may share this material, and I agree to
        </label>{' '}
        <button
          type="button"
          aria-expanded={open}
          onPointerEnter={(e) => {
            if (e.pointerType !== 'mouse') return;
            cancelClose();
            setOpen(true);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') scheduleClose();
          }}
          onClick={(e) => {
            e.preventDefault();
            setOpen((v) => !v);
          }}
          onFocus={(e) => {
            // Keyboard only. A pointer press focuses as well, and there the
            // click handler is what should decide.
            if (e.target.matches(':focus-visible')) setOpen(true);
          }}
          className="inline-flex items-center gap-1 text-accent underline decoration-dotted underline-offset-4 hover:text-accent-strong"
        >
          how it will be handled
          <Info size={14} aria-hidden />
        </button>
        .
      </span>

      {open && (
        <span
          role="tooltip"
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse') cancelClose();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') scheduleClose();
          }}
          className="card animate-rise absolute bottom-full left-0 z-30 mb-3 block max-h-[min(22rem,52vh)] w-full max-w-[28rem] overflow-auto p-5 text-left shadow-lift"
        >
          <span className="eyebrow mb-3 block">Terms · version {CONSENT_VERSION}</span>

          {CONSENT_CLAUSES.map((clause) => (
            <span key={clause.heading} className="mb-3.5 block last:mb-0">
              <span className="block font-medium text-ink">{clause.heading}</span>
              {clause.body.map((paragraph) => (
                <span key={paragraph} className="mt-1 block leading-relaxed text-muted">
                  {paragraph}
                </span>
              ))}
              {clause.heading === 'Changing your mind' && (
                <span className="mt-1 block leading-relaxed text-muted">{contactSentence()}</span>
              )}
            </span>
          ))}

          <Link
            href="/handling"
            className="mt-4 block text-accent underline underline-offset-4"
          >
            Open the full terms in their own page
          </Link>
        </span>
      )}
    </span>
  );
}
