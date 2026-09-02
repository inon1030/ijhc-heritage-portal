'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Reveals its children as they scroll into view.
 *
 * IntersectionObserver and two CSS properties, rather than a motion library.
 * The page is almost entirely server-rendered, so a client-side animation
 * runtime would be forty kilobytes of JavaScript shipped to do what forty
 * lines already do — and it would make every animated section a client
 * component, which is a real architectural cost for a fade.
 *
 * Once shown, always shown. Content that re-hides when you scroll back up is a
 * demo effect; in a reading interface it is an irritation.
 *
 * Reduced motion is handled in CSS (`globals.css`), so this component does not
 * need to know about it: the observer still runs, the transition just does not.
 */

type From = 'up' | 'left' | 'scale';

export function Reveal({
  children,
  delay = 0,
  from = 'up',
  as: Tag = 'div',
  className,
}: {
  children: React.ReactNode;
  /** Milliseconds. Use `Stagger` rather than counting these out by hand. */
  delay?: number;
  from?: From;
  as?: 'div' | 'section' | 'li' | 'article' | 'header';
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Already past it on load — a deep link, or a restored scroll position.
    if (node.getBoundingClientRect().top < window.innerHeight) {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      // Fires a little before the element's edge, so the movement finishes
      // around the moment it is properly in view rather than starting there.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      data-reveal={shown ? 'shown' : ''}
      data-reveal-from={from === 'up' ? undefined : from}
      style={delay ? ({ '--reveal-delay': `${delay}ms` } as React.CSSProperties) : undefined}
      className={className}
    >
      {children}
    </Tag>
  );
}

/**
 * Wraps a list so its children arrive one after another.
 *
 * The step is deliberately small and capped. A long stagger looks considered
 * on eight cards and feels broken on forty, because the last one is still
 * waiting after you have scrolled past it.
 */
export function Stagger({
  children,
  step = 55,
  max = 10,
  className,
  as = 'div',
}: {
  children: React.ReactNode[];
  step?: number;
  /** After this many items the delay stops growing. */
  max?: number;
  className?: string;
  as?: 'div' | 'li' | 'section';
}) {
  return (
    <div className={className}>
      {children.map((child, index) => (
        <Reveal
          key={index}
          as={as === 'div' ? 'div' : as}
          delay={Math.min(index, max) * step}
          from="up"
        >
          {child}
        </Reveal>
      ))}
    </div>
  );
}
