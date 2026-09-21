'use client';

import { useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A recording that starts from a big button in the middle of it.
 *
 * Inon, 21.09.2026: a video on the site should look like an item in the
 * archive - large and clear - and pressing the round play button in the middle
 * should play it, on every screen, not only the small icon in the browser's
 * control bar.
 *
 * ── why the video element is always there ───────────────────────────────
 *
 * The first version rendered a button, and on press swapped in a `<video
 * autoPlay>`. On a phone that often did nothing: Safari and Chrome on Android
 * only let sound play from a call made *inside* the tap, and a new element
 * mounting a render later is no longer the tap. So the `<video>` is rendered
 * from the start with `preload="none"` (nothing is downloaded until asked) and
 * the button calls `play()` on it directly in its click handler. The browser's
 * own controls appear once it is playing.
 */
export function PlayableVideo({
  src,
  poster,
  label,
  className,
}: {
  src: string;
  poster?: string | null;
  /** What the button says to a screen reader. */
  label: string;
  className?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  function start() {
    const v = video.current;
    if (!v) return;
    setStarted(true);
    // Called inside the tap, which is what lets a phone play it with sound.
    void v.play().catch(() => {
      // Refused anyway (an unusual browser setting): leave the controls up so
      // the reader can press the browser's own play.
    });
  }

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-surface-2', className)}>
      <video
        ref={video}
        src={src}
        poster={poster ?? undefined}
        preload="none"
        playsInline
        controls={started}
        className="block h-full w-full object-contain"
        data-full
      />
      {!started && (
        <button
          type="button"
          onClick={start}
          aria-label={label}
          className="group absolute inset-0 flex items-center justify-center"
        >
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-primary text-white shadow-lift ring-4 ring-white/70 transition-colors duration-200 group-hover:bg-primary-strong">
            <Play size={30} fill="currentColor" className="translate-x-[2px]" aria-hidden />
          </span>
        </button>
      )}
    </div>
  );
}
