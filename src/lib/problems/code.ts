/**
 * The short code a person quotes when they report a problem.
 *
 * Client-safe. Six characters from an alphabet without the ones people misread
 * off a screen or mishear on the phone — no 0/O, 1/I/L, 5/S, 8/B — so "E-7KQ2WX"
 * survives being typed into a spreadsheet by someone reading it aloud.
 */
const ALPHABET = '234679ACDEFGHJKMNPQRTUVWXYZ';

export function problemCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return 'E-' + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export const PROBLEM_CODE = /^E-[234679ACDEFGHJKMNPQRTUVWXYZ]{6}$/;

/**
 * The page address without what follows `?` or `#`.
 *
 * A receipt link carries its secret in the query string, and a problem row is
 * read by administrators who have no business holding that secret.
 */
export function pathOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value, 'https://archive.invalid').pathname.slice(0, 300);
  } catch {
    return String(value).split(/[?#]/)[0].slice(0, 300);
  }
}

/** Anything thrown, as a message and whatever detail it carried. */
export function describeThrown(error: unknown): { message: string; detail: string | null } {
  if (error instanceof Error) {
    return {
      message: (error.message || error.name || 'Error').slice(0, 1000),
      detail: error.stack ? error.stack.slice(0, 4000) : null,
    };
  }
  if (typeof error === 'string') return { message: error.slice(0, 1000), detail: null };
  try {
    return { message: JSON.stringify(error).slice(0, 1000), detail: null };
  } catch {
    return { message: String(error).slice(0, 1000), detail: null };
  }
}
