import { MAX_FILE_BYTES } from './validate';

/** Web Crypto has no incremental digest API. Read bounded chunks with yields,
 * then let the native asynchronous digest hash the complete (at most 50MB) input.
 * Hashing chunks separately and combining their hashes would NOT be SHA-256. */
export async function hashFile(file: Blob): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new RangeError('file_too_large');
  const bytes = new Uint8Array(file.size);
  const chunkSize = 1024 * 1024;
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    bytes.set(new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer()), offset);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
}

/** Merge handoff: use this as the JSON body at upload-flow's sign fetch. */
export async function uploadSignBody(file: File) {
  return { fileName: file.name, mimeType: file.type, byteSize: file.size, checksum: await hashFile(file) };
}
