export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/tiff',
  'application/pdf',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  /*
   * The capture of a web page — see /api/links/ingest.
   *
   * Safe to accept from anyone: storage serves it from its own origin with an
   * explicit `text/plain` content type, so it can neither run as script nor
   * reach the app's cookies. It is also a real archive format in its own right,
   * which is why it is in the list rather than special-cased.
   */
  'text/plain',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export type FileRejection = { code: 'unsupported_type' | 'too_large'; message: string };

/**
 * Runs on the client for fast feedback and again on the server, which is the
 * copy that actually counts.
 */
export function validateFile(input: { mimeType: string; byteSize: number }): FileRejection | null {
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    return {
      code: 'unsupported_type',
      message: `${input.mimeType || 'That file type'} is not accepted. Upload an image, PDF, audio, or video file — or paste a link and let the archive read the page.`,
    };
  }
  if (input.byteSize > MAX_FILE_BYTES) {
    return { code: 'too_large', message: 'Files are limited to 50 MB.' };
  }
  if (input.byteSize <= 0) {
    return { code: 'too_large', message: 'That file appears to be empty.' };
  }
  return null;
}

export function fileKind(mimeType: string): 'image' | 'pdf' | 'audio' | 'video' | 'text' | 'other' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('text/')) return 'text';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'other';
}
