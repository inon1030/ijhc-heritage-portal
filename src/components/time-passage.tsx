'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * The first four seconds of the front door.
 *
 * The Center's claim is "2,000 Years of our Heritage. Save it Now." — a span of
 * time, and an urgency about it. This says that before the headline does, by
 * moving the visitor through it: a helix of photographs receding into the
 * distance, turning as it goes, with a surveyor's rule along the bottom
 * counting the years off. You travel forward through the archive and arrive at
 * now.
 *
 * Four things it is careful about.
 *
 * **It happens on the page's own paper.** An earlier build ran it on ink,
 * because a faded scan washes out on cream and the dark made it read. It also
 * made the passage a separate thing that ended and handed over to a website.
 * On paper it *is* the website, and what a visitor watches is the front page
 * being assembled out of the archive rather than a title sequence played
 * before one. A light print is made legible on a light ground by its mount and
 * its shadow, the way a print in a room is legible on a wall of its own
 * colour — not by darkening everything behind it.
 *
 * **The photographs are the archive's own.** Not stock, not a mood board — the
 * same published records the home page already fades behind its headline, from
 * the same query. Every one was cleared by a volunteer before it could appear
 * anywhere. The corridor therefore grows as the archive grows, which is the
 * argument the page is making; and it dissolves into the wall behind it because
 * it *is* that wall. The crossfade at the end is the same pictures settling out
 * of motion into ground.
 *
 * **It plays on every arrival at the front door,** which is the Center's
 * decision and not an oversight. It was gated to once a session; the archive
 * wants the passage to be what the front door *is*, so returning to it is
 * returning to the passage.
 *
 * That only works because leaving it is free. It goes on a click, a key, a
 * scroll or a touch — every gesture that means "I want to get on with it" —
 * with a visible control as well, and it never plays at all for somebody who
 * has asked their system to stop moving things. An introduction that repeats
 * and cannot be escaped is a toll gate; one that repeats and yields to the
 * first thing you do is a threshold. The second time a visitor arrives the
 * photographs are already in the browser's cache, so the beat before it moves
 * is gone and it is the four seconds and nothing else.
 *
 * **Nothing is claimed.** The rule counts a two-thousand-year span and lands on
 * the present year. It is a scale, the way a map's scale bar is a scale. It
 * says nothing about when any particular photograph was taken, because the
 * archive mostly does not know and will not guess (decision 11).
 *
 * **It waits for the pictures.** A corridor of empty boxes is worse than no
 * corridor, so the first frames are fetched before anything moves — capped, so
 * a slow connection gets a short beat on paper rather than a stall.
 */

const TRAVEL_MS = 3800;
const LEAVE_MS = 560;
/**
 * How long the photographs are given to arrive before the corridor moves
 * anyway. A ceiling, not a wait.
 *
 * Measured on this archive: each image takes 1.1–2.3 seconds, because they are
 * unoptimised masters fetched through the permission check and a signed-URL
 * redirect, and none of them has a rendition to ask for instead. At the 700ms
 * this started on, the corridor opened on nothing at all and photographs
 * appeared halfway through — which looks like a broken page rather than an
 * introduction.
 *
 * They are not an extra cost: the home page's own wall is the same files at the
 * same addresses, so this is the page's image load either way — and because the
 * passage now plays on every arrival, the second one costs nothing at all. The
 * browser has them. The hold is a first-visit cost, once, escapable by any key
 * or click. Thumbnails would remove even that, and would do more for the wall
 * than for this.
 */
const PRELOAD_CAP_MS = 1800;

/** The corridor's geometry, in the perspective's own units. */
const GAP = 460; // between one photograph and the next
const RUN_OUT = 200; // past the last, so the corridor empties before it stops
/**
 * Degrees of turn from one photograph to the next.
 *
 * Not a divisor of 360, so the helix never lines a print up behind an earlier
 * one. At 47° — the first try — consecutive prints were about half a width
 * apart and stacked into a single clump; this is roughly one width, which
 * leaves them overlapping enough to read as a passage and separate enough to
 * read as photographs.
 */
const TURN = 83;
/**
 * How long one photograph is on screen, and the whole trick of the thing.
 *
 * The camera reaches a photograph's plane at the *end* of its life, so a print
 * grows all the way in and dissolves at its largest rather than swallowing the
 * screen and blotting out the one behind it. Meeting it halfway — the first
 * attempt — left every print at a third of its size and fading while still far
 * off, which read as a slideshow behind fog.
 */
const FRAME_LIFE = 1500;

/**
 * Where every photograph sits, and when each one appears.
 *
 * Exported and pure because it is the part that was wrong twice. The camera
 * runs at a constant speed, so a photograph only gets its full life on screen
 * if the camera starts a full life's travel short of it — otherwise the opening
 * frames arrive already half-faded, which is what the first build did to three
 * of its eight. The lead is therefore solved rather than chosen by eye:
 * `lead = FRAME_LIFE × speed`, for a run whose length includes the lead. That
 * holds however many photographs the archive turns out to hold, which is the
 * point — the number grows every time a volunteer publishes something, and
 * nobody is going to come back and retune this.
 *
 * `tests/unit/passage.test.ts` asserts the invariant directly: no cue starts
 * before the run does.
 */
export function passageCues(count: number): { travel: number; cues: { depth: number; delay: number }[] } {
  const rest = Math.max(0, count - 1) * GAP + RUN_OUT;
  const lead = (FRAME_LIFE * rest) / (TRAVEL_MS - FRAME_LIFE);
  const travel = lead + rest;

  const cues = Array.from({ length: count }, (_, i) => {
    const depth = lead + i * GAP;
    // The camera reaches this photograph's plane at the end of its life, so it
    // has to have begun a whole life earlier.
    return { depth, delay: (depth / travel) * TRAVEL_MS - FRAME_LIFE };
  });

  return { travel, cues };
}

const SPAN_YEARS = 2000;

export interface PassageFrame {
  key: string;
  /** Null on an empty mount — a plate with nothing hung on it yet. */
  src: string | null;
}

type Phase = 'holding' | 'travelling' | 'leaving';

export function TimePassage({
  frames,
  mark,
}: {
  frames: PassageFrame[];
  /*
   * Passed in rather than imported. `Logo` reads the public directory to work
   * out which file the Center actually supplied, so it is a server component;
   * importing it here would drag `node:fs` into the browser bundle. The
   * masthead hands its mark down the same way.
   */
  mark: React.ReactNode;
}) {
  const [phase, setPhase] = useState<Phase | null>(null);
  /*
   * Which photographs have actually arrived.
   *
   * The mount is part of the design — a white board with a print on it — so a
   * frame whose image has not loaded yet is a blank card sailing past, which
   * is what the corridor looked like the first time a slow one slipped through
   * the preload. An unloaded frame is not shown at all; it keeps its place in
   * the run and simply is not there, which nobody can see.
   */
  const [ready, setReady] = useState<Set<string>>(() => new Set());
  const yearRef = useRef<HTMLSpanElement>(null);
  const corridorRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const done = useRef(false);

  const endYear = new Date().getFullYear();
  const startYear = endYear - SPAN_YEARS;

  /*
   * Decided before the browser paints, not after.
   *
   * A `useEffect` here would let one frame of the finished page through first —
   * the headline appearing and then being covered, which is the opposite of an
   * introduction. `useLayoutEffect` runs between the render and the paint, so
   * the visitor sees either the corridor or the page, never both.
   */
  useIsomorphicLayoutEffect(() => {
    if (frames.length === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setPhase('holding');
  }, [frames.length]);

  const dismiss = useCallback(() => {
    if (done.current) return;
    done.current = true;
    /*
     * Ask the page to arrive.
     *
     * Changing the animation *name* is what restarts a CSS animation, so this
     * one attribute makes the headline, the two doors and the counts rise out
     * of the settling photographs instead of being revealed already sitting
     * there. See `[data-passage='arriving']` in globals.css for why they
     * cannot simply be held back until now.
     */
    document.documentElement.dataset.passage = 'arriving';
    setPhase('leaving');
    window.setTimeout(() => setPhase(null), LEAVE_MS);
  }, []);

  /* Hold the page still, and take every gesture that means "enough". */
  useEffect(() => {
    if (!phase || phase === 'leaving') return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    skipRef.current?.focus();

    const off = () => dismiss();
    window.addEventListener('keydown', off);
    window.addEventListener('wheel', off, { passive: true });
    window.addEventListener('touchmove', off, { passive: true });

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', off);
      window.removeEventListener('wheel', off);
      window.removeEventListener('touchmove', off);
    };
  }, [phase, dismiss]);

  /* Fetch the first few, then move — whichever comes first. */
  useEffect(() => {
    if (phase !== 'holding') return;
    let cancelled = false;

    const go = () => {
      if (!cancelled) setPhase('travelling');
    };
    const cap = window.setTimeout(go, PRELOAD_CAP_MS);

    Promise.all(
      frames.filter((frame) => frame.src).map(
        (frame) =>
          new Promise<void>((resolve) => {
            const img = new window.Image();
            img.onload = () => resolve();
            // A file that will not load is not worth holding the door for.
            img.onerror = () => resolve();
            img.fetchPriority = 'high';
            img.src = frame.src!;
          }),
      ),
    ).then(() => {
      window.clearTimeout(cap);
      go();
    });

    return () => {
      cancelled = true;
      window.clearTimeout(cap);
    };
  }, [phase, frames]);

  /*
   * The rule.
   *
   * Written straight to the node: sixty React renders a second to change four
   * characters would be sixty renders too many.
   *
   * **Read off the corridor's own clock, not the wall clock.** The corridor is
   * a CSS transform and runs on the compositor; a counter on `performance.now`
   * runs on the main thread, and the two come apart the moment anything blocks
   * it — a decode, a long task, a slow first paint. Measured under load, the
   * screen had already flooded with daylight while the rule still read 1774,
   * so the one moment the whole thing is built around — the year landing on the
   * present as the light comes up — did not happen. Taking the time from the
   * animation means the rule lags exactly as much as the corridor does, which
   * is to say they stay together whatever the machine is doing.
   */
  useEffect(() => {
    if (phase !== 'travelling') return;

    const node = yearRef.current;
    if (!node) return;

    const started = performance.now();
    const corridor = corridorRef.current?.getAnimations()[0];
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = Number(corridor?.currentTime ?? now - started);
      const t = Math.min(1, (Number.isFinite(elapsed) ? elapsed : now - started) / TRAVEL_MS);
      /*
       * Away fast, and settling on now.
       *
       * The first version eased in as well as out, which sounds right and is
       * not: it left the rule reading two digits for the opening second and a
       * half, which looks like a counter that has not started rather than a
       * journey that has. Antiquity is where there is least to say, so it is
       * crossed quickly; the last two centuries are where the archive's
       * material actually lives, so that is where the rule slows down.
       */
      const eased = 1 - Math.pow(1 - t, 2.4);
      node.textContent = String(Math.round(startYear + (endYear - startYear) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, startYear, endYear]);

  /* The corridor runs out, and hands the page over. */
  useEffect(() => {
    if (phase !== 'travelling') return;
    const timer = window.setTimeout(dismiss, TRAVEL_MS);
    return () => window.clearTimeout(timer);
  }, [phase, dismiss]);

  /* The attribute outlives the overlay by exactly one animation, then goes. */
  useEffect(() => {
    if (phase !== null) return;
    const timer = window.setTimeout(() => {
      delete document.documentElement.dataset.passage;
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (!phase) return null;

  const { travel, cues } = passageCues(frames.length);
  const moving = phase !== 'holding';

  /*
   * Portalled to the body.
   *
   * The home page wraps itself in `isolate`, which is a stacking context, so a
   * z-index set inside it cannot reach past the sticky masthead outside it —
   * measured: the bar sat on top of the corridor. Rather than unpick the page's
   * isolation, this leaves the tree it is written in and joins the document.
   */
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Introduction to the archive"
      data-phase={phase}
      className="passage"
      onClick={dismiss}
      style={
        {
          '--passage-travel': `${Math.round(travel)}px`,
          '--passage-duration': `${TRAVEL_MS}ms`,
          '--passage-leave': `${LEAVE_MS}ms`,
          '--passage-frame-life': `${FRAME_LIFE}ms`,
        } as React.CSSProperties
      }
    >
      <div aria-hidden className="passage-stage">
        <div ref={corridorRef} className="passage-corridor">
          {frames.map((frame, i) => {
            const angle = i * TURN;
            const { depth, delay } = cues[i];
            return (
              <figure
                key={frame.key}
                className="passage-frame"
                data-shape={SHAPES[i % SHAPES.length]}
                /* An empty mount has nothing to wait for, so it is ready as
                   soon as it is drawn. */
                data-empty={frame.src ? undefined : ''}
                data-ready={!frame.src || ready.has(frame.key) ? '' : undefined}
                style={{
                  // Centred on the corridor's axis, out along it, around it,
                  // and then turned back upright so it faces the camera square.
                  transform: [
                    'translate(-50%, -50%)',
                    `translateZ(${-depth}px)`,
                    `rotateZ(${angle}deg)`,
                    'translateY(calc(var(--passage-radius) * -1))',
                    `rotateZ(${-angle}deg)`,
                    `rotate(${TILTS[i % TILTS.length]}deg)`,
                  ].join(' '),
                  animationDelay: moving ? `${Math.round(delay)}ms` : undefined,
                }}
              >
                {frame.src ? (
                  <>
                    {/* Signed URLs expire, so next/image would cache a dead one. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={frame.src}
                      alt=""
                      decoding="async"
                      onLoad={() =>
                        setReady((seen) => (seen.has(frame.key) ? seen : new Set(seen).add(frame.key)))
                      }
                    />
                  </>
                ) : (
                  /* A plate with nothing on it — not a photograph, and not
                     pretending to be one. See `front-door.ts`. */
                  <span className="passage-plate" />
                )}
              </figure>
            );
          })}
        </div>
      </div>

      {/* The corridor's walls, so a print dissolves rather than being clipped. */}
      <div aria-hidden className="passage-vignette" />
      {/* The light at the far end of it. */}
      <div aria-hidden className="passage-bloom" />

      {/* The mark, alone on paper, while the first photographs are fetched. */}
      <div aria-hidden className="passage-mark">
        {mark}
      </div>

      {/*
        The rule sits over the daylight, not under it, so the last thing on
        screen is the year landing on the present in ink on paper. Buried under
        the flood it lost its own punchline: the number was washed out at about
        1990 and nobody ever saw it arrive.
      */}
      <div aria-hidden className="passage-rule">
        <span className="passage-year">
          <span ref={yearRef}>{startYear}</span>
          <span className="passage-era">CE</span>
        </span>
        <span className="passage-ticks" />
      </div>

      <button ref={skipRef} type="button" className="passage-skip" onClick={dismiss}>
        Skip
      </button>
    </div>,
    document.body,
  );
}

/** Not every print is square. Chosen by position, so there is nothing random. */
const SHAPES = ['portrait', 'landscape', 'square', 'landscape', 'portrait', 'square'] as const;
/** Hung by hand, near enough to straight. */
const TILTS = [-2.4, 1.8, -1.1, 2.6, -1.9, 1.2, -2.8, 0.9] as const;

/**
 * `useLayoutEffect` warns when run during server rendering, where there is no
 * layout to read. This component only ever *mounts* on the client, but it is
 * still rendered once on the server, so the hook is chosen accordingly.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
