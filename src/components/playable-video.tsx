'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A recording that starts from a big button in the middle of it.
 *
 * Inon, 21.09.2026: a video on the site should look like an item in the
 * archive - large and clear - and pressing the round play button in the middle
 * should play it, not only the small icon in the browser's control bar. A bare
 * `<video controls>` draws its own dark bar and a small triangle at the bottom
 * corner, which is exactly what an older reader misses.
 *
 * Until it is pressed this is a poster (or the site's own light surface) with
 * one 72px play button, and nothing is downloaded. Pressed, it becomes the real
 * player with its controls and starts at once. The button is a real button:
 * reachable by keyboard and named for screen readers.
 */
export function PlayableVideo({
  src,
  poster,
  label,
  className,
  videoClassName,
}: {
  src: string;
  poster?: string | null;
  /** What the button says to a screen reader, and the title under the play mark. */
  label: string;
  className?: string;
  videoClassName?: string;
}) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <video
        src={src}
        poster={poster ?? undefined}
        controls
        autoPlay
        playsInline
        className={cn('block h-full w-full bg-surface-2', videoClassName, className)}
        data-full
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={label}
      className={cn(
        'group relative block h-full w-full overflow-hidden bg-surface-2 text-start',
        className,
      )}
    >
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" data-full />
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-primary text-white shadow-lift ring-4 ring-white/70 transition-colors duration-200 group-hover:bg-primary-strong">
          <Play size={30} fill="currentColor" className="translate-x-[2px]" aria-hidden />
        </span>
      </span>
    </button>
  );
}
