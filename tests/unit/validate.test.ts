import { describe, expect, it } from 'vitest';
import { MAX_FILE_BYTES, fileKind, validateFile } from '@/lib/files/validate';

describe('validateFile', () => {
  it('accepts an ordinary photograph', () => {
    expect(validateFile({ mimeType: 'image/jpeg', byteSize: 2_000_000 })).toBeNull();
  });

  it('rejects a file type the archive cannot store', () => {
    const result = validateFile({ mimeType: 'application/x-msdownload', byteSize: 1000 });
    expect(result?.code).toBe('unsupported_type');
  });

  it('rejects a missing MIME type rather than waving it through', () => {
    expect(validateFile({ mimeType: '', byteSize: 1000 })?.code).toBe('unsupported_type');
  });

  it('rejects anything over the size cap', () => {
    expect(validateFile({ mimeType: 'image/png', byteSize: MAX_FILE_BYTES + 1 })?.code).toBe('too_large');
  });

  it('accepts a file exactly at the cap', () => {
    expect(validateFile({ mimeType: 'image/png', byteSize: MAX_FILE_BYTES })).toBeNull();
  });

  it('rejects an empty file', () => {
    expect(validateFile({ mimeType: 'image/png', byteSize: 0 })).not.toBeNull();
  });
});

describe('fileKind', () => {
  it.each([
    ['image/webp', 'image'],
    ['application/pdf', 'pdf'],
    ['audio/mpeg', 'audio'],
    ['video/mp4', 'video'],
    // A captured web page is stored as text and is a format the archive holds
    // in its own right — see /api/links/ingest.
    ['text/plain', 'text'],
  ])('maps %s to %s', (mime, expected) => {
    expect(fileKind(mime)).toBe(expected);
  });
});
