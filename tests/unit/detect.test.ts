import { describe, expect, it } from 'vitest';
import { resolveMimeType, sniffMimeType } from '@/lib/files/detect';

/** Builds a header with `bytes` at the front, padded so length checks pass. */
function header(...bytes: number[]): Uint8Array {
  const out = new Uint8Array(64);
  out.set(bytes, 0);
  return out;
}

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

describe('sniffMimeType', () => {
  it('reads a PNG signature', () => {
    expect(sniffMimeType(header(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
  });

  it('reads a JPEG signature', () => {
    expect(sniffMimeType(header(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
  });

  it('reads a WebP signature, ignoring the four size bytes', () => {
    const a = header(...ascii('RIFF'), 0x2a, 0x00, 0x00, 0x00, ...ascii('WEBP'));
    const b = header(...ascii('RIFF'), 0xff, 0xee, 0x01, 0x00, ...ascii('WEBP'));
    expect(sniffMimeType(a)).toBe('image/webp');
    expect(sniffMimeType(b)).toBe('image/webp');
  });

  it('separates WAV from WebP, which share the RIFF container', () => {
    const wav = header(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE'));
    expect(sniffMimeType(wav)).toBe('audio/wav');
  });

  it('reads TIFF in both byte orders', () => {
    expect(sniffMimeType(header(0x49, 0x49, 0x2a, 0x00))).toBe('image/tiff');
    expect(sniffMimeType(header(0x4d, 0x4d, 0x00, 0x2a))).toBe('image/tiff');
  });

  it('reads PDF and the ISO base media brands', () => {
    expect(sniffMimeType(header(...ascii('%PDF-1.7')))).toBe('application/pdf');
    expect(sniffMimeType(header(0, 0, 0, 0x18, ...ascii('ftypisom')))).toBe('video/mp4');
    expect(sniffMimeType(header(0, 0, 0, 0x18, ...ascii('ftypM4A ')))).toBe('audio/mp4');
  });

  it('returns null rather than guessing at bytes it does not know', () => {
    expect(sniffMimeType(header(0x00, 0x01, 0x02, 0x03))).toBeNull();
  });

  it('returns null for a file too short to carry a signature', () => {
    expect(sniffMimeType(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});

describe('resolveMimeType', () => {
  it('overrides a wrong claim — the kachori.jpeg case', () => {
    const webp = header(...ascii('RIFF'), 0x2a, 0x00, 0x00, 0x00, ...ascii('WEBP'));
    expect(resolveMimeType(webp, 'image/jpeg')).toBe('image/webp');
  });

  it('keeps the claim when the bytes are unrecognisable', () => {
    expect(resolveMimeType(header(0x00, 0x01), 'audio/x-m4a')).toBe('audio/x-m4a');
  });

  it('keeps the claim when the sniffed type is not one the archive accepts', () => {
    // A Matroska/WebM header is recognisable but `video/x-matroska` is not on
    // the allowlist; rejecting is validation's job, not detection's.
    const claim = 'video/webm';
    expect(resolveMimeType(header(0x1a, 0x45, 0xdf, 0xa3), claim)).toBe('video/webm');
  });

  it('agrees with a correct claim', () => {
    expect(resolveMimeType(header(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'image/png')).toBe('image/png');
  });
});
