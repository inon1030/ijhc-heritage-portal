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

/**
 * Why a file was refused, in a form both sides of the wire can say out loud.
 *
 * `message` is the English and stays the fallback. `key` and `vars` are the
 * same sentence as a catalogue entry, because this function is pure — it runs
 * in the browser for fast feedback and again in the route handler, which is the
 * copy that counts — and neither place can hand it a reader without making it
 * something other than pure. So it reports what happened and lets the caller,
 * which does have a reader, choose the words.
 */
export type FileRejection = {
  code: 'unsupported_type' | 'too_large';
  message: string;
  key: 'err.unsupportedType' | 'err.tooLarge' | 'err.fileEmpty';
  vars: Record<string, string>;
};

/**
 * Runs on the client for fast feedback and again on the server, which is the
 * copy that actually counts.
 */
export function validateFile(input: { mimeType: string; byteSize: number }): FileRejection | null {
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    const type = input.mimeType || 'That file type';
    return {
      code: 'unsupported_type',
      message: `${type} is not accepted. Upload an image, PDF, audio, or video file — or paste a link and let the archive read the page.`,
      key: 'err.unsupportedType',
      vars: { type },
    };
  }
  if (input.byteSize > MAX_FILE_BYTES) {
    return {
      code: 'too_large',
      message: 'Files are limited to 50 MB.',
      key: 'err.tooLarge',
      vars: { size: '50 MB' },
    };
  }
  if (input.byteSize <= 0) {
    return {
      code: 'too_large',
      message: 'That file appears to be empty.',
      key: 'err.fileEmpty',
      vars: {},
    };
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
