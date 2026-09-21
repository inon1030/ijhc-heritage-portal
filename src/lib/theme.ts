import 'server-only';
import { cookies } from 'next/headers';

/**
 * Light, dark, or whatever the reader's system says.
 *
 * A cookie rather than localStorage, and read on the server, because the
 * alternative is a script that runs after the first paint: the archive would
 * flash cream at somebody who asked for dark, on every navigation. The stamp
 * goes on `<html>` before the HTML leaves the server.
 *
 * "System" is the default and stores nothing — the CSS already answers it with
 * `prefers-color-scheme`.
 */
export type Theme = 'light' | 'dark' | 'system';

export const THEME_COOKIE = 'ijhc.theme';

export async function currentTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return value === 'light' || value === 'dark' ? value : 'system';
}
