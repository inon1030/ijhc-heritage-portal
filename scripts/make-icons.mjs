import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

/*
 * The archive's icon set, cut from the Center's own mark.
 *
 * The source artwork carries the word "Indian" beside the star. At 512 pixels
 * that reads; at 16, in a browser tab, it is three grey smudges against the
 * emblem. So the emblem is cropped out of it, centred on the archive's paper,
 * and written at the sizes a browser and a phone actually ask for.
 *
 * Run after replacing the logo: `node scripts/make-icons.mjs`
 */

const root = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const source = path.join(root, '.guide-tmp', 'icon.backup.png');
const paper = { r: 253, g: 251, b: 247, alpha: 1 };

const base = sharp(source).ensureAlpha();
const { width, height } = await base.metadata();

// The emblem, without the wordmark: measured off the artwork, not guessed.
const box = {
  left: Math.round(width * 0.03),
  top: Math.round(height * 0.02),
  width: Math.round(width * 0.9),
  height: Math.round(height * 0.75),
};

const emblem = await sharp(source)
  .extract(box)
  .toBuffer();

/** The emblem on paper, square, with room to breathe. */
async function square(size, { transparent = false } = {}) {
  const inner = Math.round(size * 0.82);
  const art = await sharp(emblem).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: transparent ? { r: 0, g: 0, b: 0, alpha: 0 } : paper },
  })
    .composite([{ input: art, gravity: 'centre' }])
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
}

/** An .ico holding two PNG frames, which is what every current browser reads. */
function ico(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  let offset = 6 + frames.length * 16;
  const entries = [];
  for (const { size, data } of frames) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...frames.map((f) => f.data)]);
}

const write = (file, data) => {
  fs.writeFileSync(path.join(root, file), data);
  console.log('wrote', file, Math.round(data.length / 1024) + 'KB');
};

write('src/app/icon.png', await square(512));
write('src/app/apple-icon.png', await square(180));
write('public/icon-192.png', await square(192));
write('public/icon-512.png', await square(512));

write(
  'public/favicon.ico',
  ico([
    { size: 32, data: await square(32) },
    { size: 48, data: await square(48) },
  ]),
);
