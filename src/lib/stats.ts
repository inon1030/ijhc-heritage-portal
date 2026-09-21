/**
 * Visitor measurement, and the consent it waits for.
 *
 * Three rules this file exists to keep:
 *
 * 1. **Nothing loads before a visitor agrees.** Google Analytics and a heatmap
 *    both set cookies and both send a page address to a third party, which
 *    under Israeli and European rules is not something to do first and ask
 *    about later. Declining leaves the archive entirely usable — there is no
 *    second banner, no nag, and no feature withheld.
 *
 * 2. **Nothing loads that was not configured.** With no measurement id in the
 *    environment the banner never appears at all, because there is nothing to
 *    consent to. That is the state the archive ships in.
 *
 * 3. **No record identifiers in an event.** A record id is not personal, but an
 *    address like `/receipt/<id>` is a private link, and analytics that
 *    recorded one would hand a contributor's receipt to a third party. Receipt
 *    and review pages are never measured.
 */

export const STATS_COOKIE = 'ijhc.stats';

export type StatsChoice = 'granted' | 'denied' | null;

/** The pages measurement is never allowed to see. */
export const UNMEASURED = ['/receipt', '/review', '/manage', '/login'];

export function isMeasurable(path: string): boolean {
  return !UNMEASURED.some((prefix) => path.startsWith(prefix));
}

export function readChoice(cookie: string | undefined): StatsChoice {
  return cookie === 'granted' || cookie === 'denied' ? cookie : null;
}

/** One event, if the visitor agreed and a measurement id exists. Never throws. */
export function track(event: string, params: Record<string, string | number> = {}): void {
  if (typeof window === 'undefined') return;
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag !== 'function') return;
  try {
    gtag('event', event, params);
  } catch {
    // Measurement is never allowed to break the thing being measured.
  }
}
