/**
 * A small fixed-window limiter for the one endpoint an anonymous visitor can
 * reach that costs us something: minting upload tokens.
 *
 * In-memory, so it resets on redeploy and does not coordinate across serverless
 * instances. That is enough to stop a casual script and is honest about what it
 * is; a shared store belongs in Stage 2 alongside contributor accounts.
 */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;

export interface RateLimitOptions {
  /** How many calls the window allows. */
  limit?: number;
  windowMs?: number;
}

const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  { limit = MAX_PER_WINDOW, windowMs = WINDOW_MS }: RateLimitOptions = {},
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  entry.count += 1;
  if (entry.count > limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'unknown';
}

/** Test seam. */
export function __resetRateLimit() {
  hits.clear();
}
