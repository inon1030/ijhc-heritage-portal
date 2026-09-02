/**
 * Reads pixel dimensions out of the file's own header bytes.
 *
 * This exists because the demo generated `resolution` with Math.random and
 * displayed it as if it had been read from the file. Every number this module
 * returns comes from the bytes; when it cannot tell, it returns null rather
 * than a plausible guess.
 *
 * No image library, because we only need the header and adding `sharp` to a
 * serverless deployment for two integers is not a good trade.
 */

export interface Dimensions {
  width: number;
  height: number;
}

export function readImageDimensions(bytes: Uint8Array, mimeType: string): Dimensions | null {
  try {
    switch (mimeType) {
      case 'image/png':
        return readPng(bytes);
      case 'image/jpeg':
        return readJpeg(bytes);
      case 'image/gif':
        return readGif(bytes);
      case 'image/webp':
        return readWebp(bytes);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readPng(bytes: Uint8Array): Dimensions | null {
  // 8-byte signature, then an IHDR chunk whose width/height are big-endian at 16 and 20.
  if (bytes.length < 24) return null;
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!sig.every((b, i) => bytes[i] === b)) return null;
  const dv = view(bytes);
  return { width: dv.getUint32(16, false), height: dv.getUint32(20, false) };
}

function readJpeg(bytes: Uint8Array): Dimensions | null {
  // Walk the marker segments until a Start Of Frame carries the dimensions.
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const dv = view(bytes);
  let offset = 2;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    // SOF0..SOF15, skipping the four that are not frame headers.
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) {
      return { height: dv.getUint16(offset + 5, false), width: dv.getUint16(offset + 7, false) };
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    offset += 2 + dv.getUint16(offset + 2, false);
  }
  return null;
}

function readGif(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 10) return null;
  const header = String.fromCharCode(...bytes.subarray(0, 3));
  if (header !== 'GIF') return null;
  const dv = view(bytes);
  return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
}

function readWebp(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 30) return null;
  const riff = String.fromCharCode(...bytes.subarray(0, 4));
  const webp = String.fromCharCode(...bytes.subarray(8, 12));
  if (riff !== 'RIFF' || webp !== 'WEBP') return null;

  const dv = view(bytes);
  const format = String.fromCharCode(...bytes.subarray(12, 16));

  if (format === 'VP8 ') {
    return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
  }
  if (format === 'VP8L') {
    const bits = dv.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (format === 'VP8X') {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return { width, height };
  }
  return null;
}
