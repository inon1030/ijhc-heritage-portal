// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { hashFile, uploadSignBody } from '@/lib/files/hash';
import { MAX_FILE_BYTES } from '@/lib/files/validate';
import { RecoveryEmail, RecoveryLimiter, RecoveryPassword } from '@/lib/auth/recovery';
import { dailyRetryLimit, retryEligible, STALE_READING_MS } from '@/lib/items/retry-policy';
import { en } from '@/lib/i18n/messages';
import he from '@/lib/i18n/locales/he.json';

describe('recovery boundary', () => {
  it('normalises addresses and rejects malformed ones', () => {
    expect(RecoveryEmail.parse({ email: '  Owner@Example.org ' }).email).toBe('owner@example.org');
    expect(RecoveryEmail.safeParse({ email: 'missing' }).success).toBe(false);
  });
  it('uses the same 10-character minimum and requires matching passwords', () => {
    expect(RecoveryPassword.safeParse({ password: '123456789', confirmation: '123456789' }).success).toBe(false);
    expect(RecoveryPassword.safeParse({ password: '1234567890', confirmation: '123456789x' }).success).toBe(false);
    expect(RecoveryPassword.safeParse({ password: '1234567890', confirmation: '1234567890' }).success).toBe(true);
  });
  it('limits independent buckets and expires at the boundary', () => {
    const limiter = new RecoveryLimiter();
    expect([1, 2, 3, 4].map(() => limiter.allow('email:hash', 3, 0))).toEqual([true, true, true, false]);
    expect(limiter.allow('ip:other', 10, 0)).toBe(true);
    expect(limiter.allow('email:hash', 3, 3_600_000)).toBe(true);
  });
  it('fails closed when the bounded map is full', () => {
    const limiter = new RecoveryLimiter();
    for (let n = 0; n < 10_000; n++) limiter.allow(`key:${n}`, 3, 0);
    expect(limiter.allow('new', 3, 1)).toBe(false);
    expect(limiter.allow('new', 3, 3_600_000)).toBe(true);
  });
});

describe('SHA-256', () => {
  it('matches the standard SHA-256 vector', async () => {
    expect(await hashFile(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('hashes a chunk boundary as one byte sequence, not as concatenated chunk hashes', async () => {
    const bytes = new Uint8Array(1024 * 1024 + 3).fill(42);
    expect(await hashFile(new Blob([bytes]))).toBe(createHash('sha256').update(bytes).digest('hex'));
  });
  it('rejects an oversized file before reading any bytes', async () => {
    await expect(hashFile({ size: MAX_FILE_BYTES + 1 } as Blob)).rejects.toThrow('file_too_large');
  });
  it('provides the additive sign-request integration contract', async () => {
    const body = await uploadSignBody(new File(['abc'], 'archive.txt', { type: 'text/plain' }));
    expect(body).toMatchObject({ fileName: 'archive.txt', mimeType: 'text/plain', byteSize: 3 });
    expect(body.checksum).toHaveLength(64);
  });
});

describe('retry policy', () => {
  it.each([[undefined, 5], ['', 5], ['-1', 5], ['1.5', 5], ['broken', 5], ['0', 0], ['8', 8], ['999', 20]])('validates daily budget %s', (value, expected) => {
    expect(dailyRetryLimit(value as string | undefined)).toBe(expected);
  });
  const now = Date.parse('2026-10-20T12:00:00Z');
  const reading = { status: 'pending', retry_count: 0, created_at: new Date(now - STALE_READING_MS - 1).toISOString(), last_retry_at: null };
  it('requires a two-hour lease expiry for pending work', () => {
    expect(retryEligible(reading, now)).toBe(true);
    expect(retryEligible({ ...reading, last_retry_at: new Date(now - 1000).toISOString() }, now)).toBe(false);
  });
  it('never retries success or a fourth attempt', () => {
    expect(retryEligible({ ...reading, status: 'succeeded' }, now)).toBe(false);
    expect(retryEligible({ ...reading, status: 'failed', retry_count: 3 }, now)).toBe(false);
    expect(retryEligible({ ...reading, status: 'failed', retry_count: 2 }, now)).toBe(true);
  });
});

it('has hand-written Hebrew for every new UI and email message', () => {
  for (const [key, value] of Object.entries(en)) {
    if (!/^(recovery|phase2|duplicates|retry)\./.test(key)) continue;
    const translated = he[key as keyof typeof he];
    expect(translated, key).toMatch(/[\u0590-\u05ff]/);
    expect(translated, key).not.toEqual(value);
  }
});
