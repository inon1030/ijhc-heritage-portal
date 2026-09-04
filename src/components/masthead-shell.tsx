'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * The masthead, folded away until you want it.
 *
 * Collapsed it is a slim strip across the top of the page. A mouse over the
 * strip opens it; a click anywhere inside pins it open until you click
 * somewhere else — including across a navigation, which is what "until you
 * click somewhere else" has to mean if it is to mean anything. Keyboard focus
 * opens it too, or the navigation would be unreachable without a mouse.
 *
 * Two decisions worth stating, because both were the difference between this
 * feeling considered and feeling broken:
 *
 * **The open bar floats over the page rather than pushing it down.** In the
 * flow, brushing the strip on the way to something else would shove every line
 * of the article down fifty pixels and then pull it back. Nothing below the
 * header moves, ever.
 *
 * **Hover is guarded on `pointerType`.** A tap synthesises `mouseenter` before
 * the click, so an unguarded hover-to-open and a click-to-pin fight each other
 * and the panel shuts in the same gesture it opened. A mouse hovers; a finger
 * taps. The strip is 44px tall on a phone for that reason, and slim only where
 * there is a pointer to aim with.
 */
export function MastheadShell({
  mark,
  rule,
  language,
  children,
}: {
  /** The small mark shown on the strip itself, so the archive is still named. */
  mark: React.ReactNode;
  /**
   * The proportional stream rule. It stays outside the fold: it is four pixels
   * tall, it is the archive's own signature, and it gives the strip a coloured
   * edge to sit on.
   */
  rule: React.ReactNode;
  /**
   * The language control. A sibling of the strip's button, not a child of it:
   * a button inside a button is invalid and browsers resolve it by dropping
   * one of the two. It stays visible when the bar is open, because "what
   * language am I reading this in" is a question at any moment.
   */
  language: React.ReactNode;
  children: React.ReactNode;
}) {
  const [pinned, setPinned] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const header = useRef<HTMLElement>(null);

  const open = pinned || hovering || focused;

  // A click outside unpins. A click inside is what pinned it in the first place.
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: PointerEvent) => {
      if (!header.current?.contains(e.target as Node)) setPinned(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPinned(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [pinned]);

  return (
    <header
      ref={header}
      className="sticky top-0 z-40"
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setHovering(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setHovering(false);
      }}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        // Only when focus has actually left the header, not merely moved
        // between two things inside it.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false);
      }}
    >
      {/* The strip. Always there, always in the flow, never moves. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="masthead-bar"
        aria-label={open ? 'Close the menu' : 'Open the menu'}
        onClick={() => setPinned((v) => !v)}
        className="flex h-11 w-full items-center justify-between gap-3 bg-paper/90 px-6 backdrop-blur-md transition-colors hover:bg-paper-2/90 sm:h-9"
      >
        <span className="flex items-center gap-2.5">
          {mark}
          <span className="wordmark hidden text-[0.95rem] sm:inline">
            Indian Jewish Heritage Center
          </span>
          <span className="wordmark text-base sm:hidden">IJHC</span>
        </span>

        {/*
          The prompt shows only while the bar is shut. Once it is open the bar
          itself is the answer to "what is this", and a CLOSE label on a strip
          you can dismiss by moving the mouse is one more thing to read.
          Screen readers still get the state from aria-expanded and the label
          below, which do change.
        */}
        <span
          aria-hidden
          className={[
            'flex items-center gap-2 text-muted transition-all duration-300',
            open ? 'pointer-events-none translate-x-2 opacity-0' : 'opacity-100',
          ].join(' ')}
        >
          <span className="eyebrow">menu</span>
          <ChevronDown size={16} />
        </span>
      </button>

      {/*
        Its own island inside the header.
        Reaching for the language control should not also unfold the whole
        navigation bar over the page — the header opens on hover and on focus,
        and both events pass through here on their way up. Stopped at the door.
      */}
      <div
        className="absolute right-[4.75rem] top-1.5 z-10 sm:top-0.5"
        onPointerEnter={(e) => e.stopPropagation()}
        onFocus={(e) => e.stopPropagation()}
      >
        {language}
      </div>

      {rule}

      {/*
        Floating, so the page beneath is untouched. The grid-rows trick animates
        to the content's own height without anyone having to know what that is.
      */}
      <div className="relative">
        <div
          id="masthead-bar"
          inert={!open ? true : undefined}
          className={[
            'absolute inset-x-0 top-0 grid overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
            open
              ? 'grid-rows-[1fr] border-b border-rule bg-paper/95 opacity-100 shadow-lift backdrop-blur-md'
              : 'pointer-events-none grid-rows-[0fr] opacity-0',
          ].join(' ')}
        >
          <div className="min-h-0">{children}</div>
        </div>
      </div>
    </header>
  );
}
