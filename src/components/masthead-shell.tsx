'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useMessages } from '@/lib/i18n/provider';

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
  home,
  rule,
  language,
  children,
}: {
  /**
   * The mark and the Center's name on the strip, as a link home.
   *
   * A sibling of the toggle rather than a child of it: an anchor inside a
   * button is invalid, and browsers resolve it by dropping one of the two —
   * which is why the archive's own mark could not be the way home until now.
   * It is absolutely positioned into the strip's left, and the button carries
   * the room for it on its padding.
   *
   * Logical properties throughout — `start`/`end` and `ps`/`pe`, never
   * `left`/`right` and `pl`/`pr`. In Hebrew the whole strip mirrors, and a mark
   * pinned with `left-6` stays on the left while the `justify-end` label moves
   * there too: seen on the deployed Hebrew page, the wordmark and MENU printed
   * on top of each other. Physical directions are a bug in any component that
   * has to work in five languages, two of which do not run the same way.
   *
   * That room is reserved **only from `sm:` up**, and the reason is measured.
   * The label is `justify-end`, so the left padding never actually holds it off
   * the mark — it only sets the button's minimum width. At 375px that minimum
   * would exceed the viewport and the whole page would scroll sideways on a
   * phone; there is room without it, because the short wordmark is used below
   * `sm:`. The right reserve stays at both sizes, because that is the one that
   * keeps MENU off the language picker.
   *
   * **Re-measured when the strip was enlarged.** The bar is 48px from `sm:` up
   * and 56px on a phone — it was 36 and 44 — with a 32px mark and a 1.1rem
   * wordmark, because a strip nobody notices is a way home nobody finds. At
   * 1440 the home block is 314px wide in Hebrew and wider in English, so the
   * reserve is 19.5rem rather than the 15rem that held the old 268px block.
   */
  home: React.ReactNode;
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
  const t = useMessages();
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
        aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
        onClick={() => setPinned((v) => !v)}
        className="flex h-16 w-full items-center justify-end gap-3 bg-paper/90 pe-[8rem] backdrop-blur-md transition-colors hover:bg-paper-2/90 sm:h-14 sm:ps-[20.5rem]"
      >
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
          <span className="eyebrow text-[0.82rem]">{t('nav.menu')}</span>
          <ChevronDown size={18} />
        </span>
      </button>

      {/*
        Its own island inside the header, in space the strip reserves for it.

        It was absolutely positioned over the strip, and the strip's own
        right-hand padding did not know about it: MENU and the language mark
        overlapped by about a dozen pixels. The button carries the room on its
        padding now, so the two are laid out beside each other rather than on
        top of each other, at every width.
        Reaching for the language control should not also unfold the whole
        navigation bar over the page — the header opens on hover and on focus,
        and both events pass through here on their way up. Stopped at the door.
      */}
      {/* The way home, in space the strip reserves for it on the left. */}
      <div
        className="absolute start-6 top-0 flex h-16 items-center sm:h-14"
        onPointerEnter={(e) => e.stopPropagation()}
        onFocus={(e) => e.stopPropagation()}
      >
        {home}
      </div>

      <div
        className="absolute end-5 top-0 z-10 flex h-16 items-center sm:h-14"
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
