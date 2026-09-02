import { describe, expect, it } from 'vitest';
import { readImageDimensions } from '@/lib/files/dimensions';

/**
 * These matter more than they look. The Bolt demo produced `resolution` with
 * Math.random and showed it to reviewers as if it had been read from the file.
 * The contract here is: real numbers, or null. Never a plausible guess.
 */

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  const dv = new DataView(bytes.buffer);
  dv.setUint32(16, width, false);
  dv.setUint32(20, height, false);
  return bytes;
}

function gif(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(13);
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
  const dv = new DataView(bytes.buffer);
  dv.setUint16(6, width, true);
  dv.setUint16(8, height, true);
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  // SOI, then a comment segment to prove the walker skips it, then SOF0.
  const bytes = new Uint8Array(24);
  const dv = new DataView(bytes.buffer);
  bytes.set([0xff, 0xd8], 0);
  bytes.set([0xff, 0xfe], 2);
  dv.setUint16(4, 4, false); // comment length, payload 2 bytes
  bytes.set([0xff, 0xc0], 8);
  dv.setUint16(10, 11, false); // SOF length
  bytes[12] = 8; // precision
  dv.setUint16(13, height, false);
  dv.setUint16(15, width, false);
  return bytes;
}

describe('readImageDimensions', () => {
  it('reads PNG dimensions', () => {
    expect(readImageDimensions(png(1600, 900), 'image/png')).toEqual({ width: 1600, height: 900 });
  });

  it('reads GIF dimensions', () => {
    expect(readImageDimensions(gif(320, 240), 'image/gif')).toEqual({ width: 320, height: 240 });
  });

  it('reads JPEG dimensions past an intervening segment', () => {
    expect(readImageDimensions(jpeg(3170, 1129), 'image/jpeg')).toEqual({ width: 3170, height: 1129 });
  });

  it('returns null for a type it cannot parse', () => {
    expect(readImageDimensions(png(10, 10), 'application/pdf')).toBeNull();
  });

  it('returns null for truncated bytes instead of guessing', () => {
    expect(readImageDimensions(new Uint8Array([137, 80]), 'image/png')).toBeNull();
  });

  it('returns null when the signature is wrong', () => {
    expect(readImageDimensions(new Uint8Array(32), 'image/png')).toBeNull();
  });
});
