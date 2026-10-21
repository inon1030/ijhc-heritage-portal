import 'server-only';
import sharp from 'sharp';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { escapePango } from './credit-text';

export const CREDIT_FONT = path.join(process.cwd(), 'assets/fonts/Heebo.ttf');
const PAPER = '#fdfbf7';

export function creditCachePath(fileId: string, checksum: string | null, sourcePath: string, variant: string, text: string): string {
  const hash = createHash('sha256').update(JSON.stringify(['credit-v1', fileId, checksum, sourcePath, variant, text])).digest('hex');
  return `renditions/credits/${hash}.jpg`;
}

export async function renderCredit(text: string, width: number, height: number): Promise<Buffer> {
  return sharp({ text: {
    text: `<span foreground="#2c3a16">${escapePango(text)}</span>`,
    font: 'Heebo', fontfile: CREDIT_FONT, rgba: true,
    width, height, align: 'center', wrap: 'word-char',
  } }).png().toBuffer();
}

/** Appends rather than covers pixels. A tiny image is returned as a JPEG without a band. */
export async function composeCredit(bytes: Uint8Array, text: string): Promise<Buffer> {
  const { data, info } = await sharp(Buffer.from(bytes)).rotate().flatten({ background: PAPER }).toBuffer({ resolveWithObject: true });
  if (info.width < 160) return sharp(data).jpeg({ quality: 88 }).toBuffer();
  const band = Math.min(48, Math.max(18, Math.round(info.height * 0.04)));
  const label = await renderCredit(text, info.width - 12, band - 4);
  const size = await sharp(label).metadata();
  return sharp(data).extend({ bottom: band, background: PAPER }).composite([{
    input: label, left: Math.floor((info.width - size.width!) / 2), top: info.height + Math.floor((band - size.height!) / 2),
  }]).jpeg({ quality: 88 }).toBuffer();
}
