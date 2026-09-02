/**
 * Works out what a file actually is, from its first bytes.
 *
 * A filename extension is a claim, not a fact. One of the images carried over
 * from the pilot demo is named `kachori.jpeg` and is a WebP; storing it as
 * `image/jpeg` meant the wrong content type in the database, the wrong
 * Content-Type served from storage, and dimensions that could not be read
 * because a JPEG parser was handed WebP bytes.
 *
 * Contributors send phone photos and files renamed by hand. The extension will
 * be wrong sometimes, and the archive's own rule is that facts come from the
 * bytes.
 */

import { ALLOWED_MIME_TYPES } from './validate';

interface Signature {
  mime: string;
  /** Byte offset the pattern starts at. */
  offset: number;
  /** Bytes to match; null means "any byte here". */
  bytes: (number | null)[];
}

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

const SIGNATURES: Signature[] = [
  { mime: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', offset: 0, bytes: ascii('GIF8') },
  // RIFF....WEBP — the four size bytes in between are ignored.
  { mime: 'image/webp', offset: 0, bytes: [...ascii('RIFF'), null, null, null, null, ...ascii('WEBP')] },
  { mime: 'image/tiff', offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] },
  { mime: 'image/tiff', offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { mime: 'application/pdf', offset: 0, bytes: ascii('%PDF-') },
  { mime: 'audio/mpeg', offset: 0, bytes: ascii('ID3') },
  { mime: 'audio/mpeg', offset: 0, bytes: [0xff, 0xfb] },
  { mime: 'audio/wav', offset: 0, bytes: [...ascii('RIFF'), null, null, null, null, ...ascii('WAVE')] },
  { mime: 'audio/ogg', offset: 0, bytes: ascii('OggS') },
  // ISO base media: ....ftyp, then a brand that separates audio from video.
  { mime: 'video/mp4', offset: 4, bytes: [...ascii('ftyp'), ...ascii('isom')] },
  { mime: 'video/mp4', offset: 4, bytes: [...ascii('ftyp'), ...ascii('mp4')] },
  { mime: 'video/quicktime', offset: 4, bytes: [...ascii('ftyp'), ...ascii('qt')] },
  { mime: 'audio/mp4', offset: 4, bytes: [...ascii('ftyp'), ...ascii('M4A')] },
  { mime: 'video/webm', offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
];

function matches(bytes: Uint8Array, sig: Signature): boolean {
  if (bytes.length < sig.offset + sig.bytes.length) return false;
  return sig.bytes.every((b, i) => b === null || bytes[sig.offset + i] === b);
}

/** The MIME type the bytes say this is, or null when nothing matches. */
export function sniffMimeType(bytes: Uint8Array): string | null {
  for (const sig of SIGNATURES) {
    if (matches(bytes, sig)) return sig.mime;
  }
  return null;
}

/**
 * The type to record for a file.
 *
 * The bytes win when they are recognisable and the archive accepts that type.
 * The claimed type is the fallback, because a format we cannot sniff is not the
 * same as a format we should reject — validation is a separate decision.
 */
export function resolveMimeType(bytes: Uint8Array, claimed: string): string {
  const sniffed = sniffMimeType(bytes);
  if (!sniffed) return claimed;
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(sniffed)) return claimed;
  return sniffed;
}
