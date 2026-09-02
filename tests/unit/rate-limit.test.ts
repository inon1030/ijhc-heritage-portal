import { beforeEach, describe, expect, it } from 'vitest';
import { __resetRateLimit, clientKey, rateLimit } from '@/lib/rate-limit';

describe('rateLimit', () => {
  beforeEach(() => __resetRateLimit());

  it('allows a normal burst of uploads', () => {
    for (let i = 0; i < 12; i++) {
      expect(rateLimit('1.2.3.4').allowed).toBe(true);
    }
  });

  it('stops the thirteenth request in the window', () => {
    for (let i = 0; i < 12; i++) rateLimit('1.2.3.4');
    const result = rateLimit('1.2.3.4');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('counts each caller separately', () => {
    for (let i = 0; i < 13; i++) rateLimit('1.2.3.4');
    expect(rateLimit('5.6.7.8').allowed).toBe(true);
  });
});

describe('clientKey', () => {
  it('takes the first address from x-forwarded-for', () => {
    const request = new Request('https://example.test', {
      headers: { 'x-forwarded-for': '203.0.113.9, 70.41.3.18' },
    });
    expect(clientKey(request)).toBe('203.0.113.9');
  });

  it('falls back when the header is absent', () => {
    expect(clientKey(new Request('https://example.test'))).toBe('unknown');
  });
});
