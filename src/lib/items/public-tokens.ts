import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { serviceRoleKey } from '@/lib/env';

function signature(purpose: string, id: string, time: number): string {
  return createHmac('sha256', serviceRoleKey()).update(`public-feedback/v1:${purpose}:${id}:${time}`).digest('base64url');
}
export function publicToken(purpose: 'form' | 'objection', id: string, now = Date.now()): string {
  return `${now}.${signature(purpose, id, now)}`;
}
export function verifyPublicToken(purpose: 'form' | 'objection', id: string, token: string, now = Date.now()): boolean {
  const [stamp, supplied, extra] = token.split('.');
  const time = Number(stamp);
  const age = now - time;
  if (extra || !supplied || !Number.isSafeInteger(time) || age < (purpose === 'form' ? 3000 : 0) ||
    age > (purpose === 'form' ? 24 * 60 * 60_000 : 30 * 24 * 60 * 60_000)) return false;
  const expected = Buffer.from(signature(purpose, id, time));
  const given = Buffer.from(supplied);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
