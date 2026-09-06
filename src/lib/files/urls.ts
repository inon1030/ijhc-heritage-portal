import type { ItemFile } from '@/lib/types';

/**
 * Where a file is fetched from. Two functions, no dependencies, either side.
 *
 * They used to live in `file-preview.tsx`. When that component needed the
 * message catalogue it became a client module, and `'use client'` applies to
 * the *whole file* — so `viewableUrl`, a pure string builder, became a client
 * export that server code was still importing. The production build turned that
 * into an error on every page that draws a record:
 *
 *     Attempted to call viewableUrl() from the server but viewableUrl is on
 *     the client.
 *
 * Worth stating plainly, because it is a shape that will recur: a helper shared
 * across the boundary does not belong in a component file at all. Dev did not
 * catch it; the deployed build did.
 */

/**
 * Every asset is fetched through /api/files/[id], which checks permission and
 * then redirects to a short-lived signed URL. Storage paths are never exposed.
 */
export function fileUrl(fileId: string) {
  return `/api/files/${fileId}`;
}

/**
 * The address to put in an `<img>`.
 *
 * A TIFF master will not render in Chrome or Firefox, so anything with a
 * derivative is shown through it. The master stays one click away and is what
 * "Open file" reaches. The route makes the same permission decision either way.
 */
export function viewableUrl(file: ItemFile) {
  return file.preview_path ? `/api/files/${file.id}?rendition` : `/api/files/${file.id}`;
}
