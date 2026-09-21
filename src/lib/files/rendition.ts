import 'server-only';
import sharp from 'sharp';

/**
 * A web-viewable copy of an image no browser will display.
 *
 * TIFF is the format archives actually receive — it is what a flatbed scanner
 * writes and what a conservator asks for, because it is lossless. It is also
 * the one image format Chrome and Firefox refuse to render. The archive
 * accepted `image/tiff` from the first migration, so a contributor could upload
 * a scan, see an empty grey square, and have no way to tell whether the file
 * had arrived.
 *
 * The answer is the one every archive uses: keep the master untouched and make
 * a **derivative** for people to look at. The TIFF stays exactly as it was
 * uploaded — nothing is re-encoded over it, nothing is lost — and a JPEG
 * rendition sits beside it in its own folder, referenced by
 * `item_files.preview_path`.
 *
 * Deliberately not done in the browser. A 40 MB scan decoded on a phone is a
 * frozen tab, and shipping a TIFF decoder to every visitor of the public portal
 * is 35 KB spent on a format most of them will never open.
 */

/** Formats a browser will render on its own. Everything else needs a derivative. */
const BROWSER_RENDERS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Long edge of the derivative.
 *
 * Large enough to read a page of Marathi in the lightbox, small enough that the
 * portal does not send a megabyte per thumbnail. The master is always one click
 * away for anyone who needs the detail.
 */
const MAX_EDGE = 2000;

/**
 * Long edge of a grid tile.
 *
 * The portal draws cards at 91–293 CSS pixels and the record page at 240. 640
 * covers all of them on a 2× screen and nothing more; anyone who wants the
 * detail is one click from the master.
 */
const THUMB_EDGE = 640;

/** A tile-sized JPEG, or null if the bytes cannot be read. */
export async function makeThumb(bytes: Uint8Array): Promise<Buffer | null> {
  try {
    return await sharp(Buffer.from(bytes), { failOn: 'none' })
      .rotate()
      .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true, progressive: true })
      .toBuffer();
  } catch (error) {
    console.error('[rendition] could not make a thumbnail', error);
    return null;
  }
}

export function needsRendition(mimeType: string): boolean {
  return mimeType.startsWith('image/') && !BROWSER_RENDERS.has(mimeType);
}

/** Where a file's derivative lives. Derived from the master's path, never guessed at. */
export function renditionPath(storagePath: string): string {
  return `renditions/${storagePath.replace(/^uploads\//, '')}.jpg`;
}

export interface Rendition {
  bytes: Uint8Array;
  mimeType: 'image/jpeg';
  /** The derivative's own size, after the long edge was capped. */
  width: number;
  height: number;
  /**
   * The **master's** size, read from its header.
   *
   * The archive's own dimension reader knows JPEG, PNG, WebP and GIF and says
   * "not measured" for a TIFF, which is honest but a waste: decoding the file
   * is already happening here, and its header is right there. Measured from the
   * bytes like everything else — project rule 2 is about not *inventing* a
   * number, not about refusing one that was read.
   */
  sourceWidth: number | null;
  sourceHeight: number | null;
}

/**
 * Renders one image to JPEG, or returns null if it cannot be read.
 *
 * A null is not an error worth failing the upload over: the master is stored,
 * the analysis still runs, and the screens fall back to naming the file. A
 * corrupt TIFF should cost a preview, not a contribution.
 */
export async function makeRendition(bytes: Uint8Array): Promise<Rendition | null> {
  try {
    const image = sharp(Buffer.from(bytes), { failOn: 'none' });
    const source = await image.metadata();

    // `withoutEnlargement` so a small scan is not blown up into a soft mess.
    const { data, info } = await image
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    return {
      bytes: new Uint8Array(data),
      mimeType: 'image/jpeg',
      width: info.width,
      height: info.height,
      sourceWidth: source.width ?? null,
      sourceHeight: source.height ?? null,
    };
  } catch (error) {
    console.error('[rendition] could not render', error);
    return null;
  }
}
