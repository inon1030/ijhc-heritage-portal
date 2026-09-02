import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The submission receipt.
 *
 * It opens a page that reads a `pending` record with the service-role client —
 * out of RLS's reach — so the signature is the only thing standing between a
 * stranger and somebody else's unpublished contribution. These are the
 * forgeries worth trying.
 */

beforeAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-for-receipts';
});

const load = async () => await import('@/lib/items/receipt');

const ITEM = '8f14e45f-ea8d-4b7a-b0a2-1c2d3e4f5a6b';
const OTHER = '3c9a1b77-11de-4f0a-9d2e-77ab5c0e1f34';

describe('a receipt opens one submission and no other', () => {
  it('accepts the token it issued', async () => {
    const { receiptFor, verifyReceipt } = await load();
    expect(verifyReceipt(ITEM, receiptFor(ITEM))).toBe(true);
  });

  it('is stable, so the same link keeps working', async () => {
    // A contributor is told to keep this link. If it were salted per call, the
    // link handed over at submission would stop opening the page.
    const { receiptFor } = await load();
    expect(receiptFor(ITEM)).toBe(receiptFor(ITEM));
  });

  it("refuses one record's token on another record", async () => {
    const { receiptFor, verifyReceipt } = await load();
    expect(verifyReceipt(OTHER, receiptFor(ITEM))).toBe(false);
  });

  it('refuses a forged, truncated, extended or absent token', async () => {
    const { receiptFor, verifyReceipt } = await load();
    const token = receiptFor(ITEM);

    expect(verifyReceipt(ITEM, 'not-a-real-receipt')).toBe(false);
    expect(verifyReceipt(ITEM, token.slice(0, -1))).toBe(false);
    expect(verifyReceipt(ITEM, `${token}x`)).toBe(false);
    expect(verifyReceipt(ITEM, '')).toBe(false);
    expect(verifyReceipt(ITEM, undefined)).toBe(false);
    expect(verifyReceipt(ITEM, null)).toBe(false);
    expect(verifyReceipt(ITEM, 42)).toBe(false);
  });

  it('is long enough that guessing is not a strategy', async () => {
    // 32 base64url characters is 192 bits.
    const { receiptFor } = await load();
    expect(receiptFor(ITEM)).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});
