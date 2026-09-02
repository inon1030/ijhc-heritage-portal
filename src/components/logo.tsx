import { existsSync } from 'node:fs';
import path from 'node:path';
import { BookOpen } from 'lucide-react';

/**
 * The Center's mark.
 *
 * What the Center supplied is a **lockup**, not a symbol: a blue Star of David
 * around a saffron Ashoka chakra, then "ijhc", then the full name. That matters
 * for how it is used. The name is inside the artwork, so the masthead must not
 * also set the name in type beside it — the first pass did, and read
 * "Indian Jewish Heritage Center Indian Jewish Heritage Center".
 *
 * It is also 2:1 and carries a line of small text. Below roughly 110px wide
 * that line is unreadable, so narrow screens get `mark` — the star and chakra
 * cropped out of the same file, which is what the logo is recognised by.
 *
 * The file arrived as RGB with a white background baked in, which on a cream
 * masthead is a visible white box. The white outside the artwork was made
 * transparent by flood-filling inward from the border, so that the white
 * *inside* the star and at the hub of the chakra survives; edge pixels were
 * feathered by how far from white they are, so there is no pale halo.
 *
 * If no file is present at all the open book stands in, deliberately plain, so
 * that nobody mistakes the placeholder for the real thing.
 */

const LOCKUP = ['logo.svg', 'logo.png', 'logo.webp'];
const MARK = ['logo-mark.svg', 'logo-mark.png', 'logo-mark.webp'];

/** Resolved once at module load: the public directory does not change at runtime. */
const find = (names: string[]) =>
  names.find((name) => existsSync(path.join(process.cwd(), 'public', name)));

const lockupFile = find(LOCKUP);
const markFile = find(MARK) ?? lockupFile;

export function Logo({
  size = 36,
  variant = 'mark',
  className = '',
}: {
  /** Rendered height in pixels. Width follows the artwork. */
  size?: number;
  /** `lockup` includes the name; `mark` is the star alone. */
  variant?: 'lockup' | 'mark';
  className?: string;
}) {
  const file = variant === 'lockup' ? lockupFile : markFile;

  if (file) {
    return (
      // Not next/image: the file is whatever the Center supplies, its intrinsic
      // size is unknown until it arrives, and a masthead mark is not worth a
      // layout-shift guess. The name is carried in text beside or under it.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/${file}`}
        alt=""
        aria-hidden
        className={`shrink-0 object-contain ${className}`}
        style={{ height: size, width: 'auto' }}
      />
    );
  }

  return <BookOpen size={size} strokeWidth={1.4} className={`shrink-0 ${className}`} aria-hidden />;
}

/**
 * True when the Center's own artwork is in place.
 *
 * The masthead branches on this: with the lockup, the name lives in the
 * artwork and is set only for screen readers; without it, the name is set in
 * type beside the placeholder.
 */
export const hasSuppliedLogo = Boolean(lockupFile);
