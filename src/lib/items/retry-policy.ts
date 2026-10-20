export const RETRY_LIMIT = 3;
export const STALE_READING_MS = 2 * 60 * 60_000;
export function dailyRetryLimit(raw: string | undefined): number {
  if (!raw?.trim()) return 5;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? Math.min(n, 20) : 5;
}
export function retryEligible(reading: { status: string; retry_count: number; created_at: string; last_retry_at: string | null }, now = Date.now()) {
  return reading.retry_count < RETRY_LIMIT && (reading.status === 'failed' ||
    (reading.status === 'pending' && Date.parse(reading.last_retry_at ?? reading.created_at) < now - STALE_READING_MS));
}
