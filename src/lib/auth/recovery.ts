import { z } from 'zod';

export const RecoveryEmail = z.object({ email: z.string().trim().toLowerCase().email().max(160) });
export const RecoveryPassword = z.object({
  password: z.string().min(10).max(200),
  confirmation: z.string().min(10).max(200),
}).refine((value) => value.password === value.confirmation);

/** Bounded and instance-local, deliberately never retaining a plain email. */
export class RecoveryLimiter {
  private entries = new Map<string, { count: number; until: number }>();
  allow(key: string, limit: number, now = Date.now()): boolean {
    for (const [k, entry] of this.entries) if (entry.until <= now) this.entries.delete(k);
    const entry = this.entries.get(key);
    if (entry) return ++entry.count <= limit;
    if (this.entries.size >= 10_000) return false;
    this.entries.set(key, { count: 1, until: now + 60 * 60_000 });
    return true;
  }
}
