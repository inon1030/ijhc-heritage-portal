import { isIP } from 'node:net';

/**
 * Which addresses the archive is allowed to fetch, as pure rules.
 *
 * Split out from `fetch.ts` deliberately. That module is `server-only` and so
 * cannot be imported by a test runner — and this is the one part of the link
 * feature where a mistake does not produce a bad record but an exfiltrated
 * credential. It has to be directly testable, so it lives where nothing is in
 * the way of testing it.
 */

export type LinkRejection = {
  code: 'bad_url' | 'blocked_host' | 'unreachable' | 'too_large' | 'not_readable';
  message: string;
};

/**
 * Is this an address on the public internet?
 *
 * Written as an explicit list of what is *not* rather than a pattern of what
 * is, because the failure mode of a clever regex here is silent and total.
 */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v6 = ip.toLowerCase();
    // Loopback and unspecified.
    if (v6 === '::1' || v6 === '::') return true;
    // Unique-local (fc00::/7) and link-local (fe80::/10).
    if (/^f[cd]/.test(v6)) return true;
    if (v6.startsWith('fe80')) return true;
    // IPv4 written as IPv6 — ::ffff:169.254.169.254 is the metadata endpoint.
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }

  const parts = ip.split('.').map(Number);
  // Fails closed: an address this cannot read is one it cannot vouch for.
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;

  if (a === 0) return true; // this network
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local — and the cloud metadata endpoint
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast and reserved

  return false;
}

/** Parses and rejects anything that is not a plain public web address. */
export function parseTarget(raw: string): { url: URL } | { rejection: LinkRejection } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { rejection: { code: 'bad_url', message: 'That is not a web address.' } };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { rejection: { code: 'bad_url', message: 'Only http and https addresses can be read.' } };
  }

  // Credentials in a URL are either a mistake or an attempt to make the server
  // authenticate somewhere on the caller's behalf. Neither belongs in an archive.
  if (url.username || url.password) {
    return {
      rejection: { code: 'bad_url', message: 'Remove the username and password from the address.' },
    };
  }

  return { url };
}

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'];
const VIMEO_HOSTS = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'];

/**
 * An exact host list, never a substring match.
 *
 * `youtube.com.evil.test` contains "youtube.com", and matching on that would
 * hand an attacker-controlled page to the oEmbed path to be trusted as a
 * description of a video.
 */
export function videoProvider(url: URL): 'youtube' | 'vimeo' | null {
  const host = url.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.includes(host)) return 'youtube';
  if (VIMEO_HOSTS.includes(host)) return 'vimeo';
  return null;
}

export function isVideoHost(url: URL): boolean {
  return videoProvider(url) !== null;
}

/**
 * What an address turned out to be, decided on the type the server sent back.
 *
 * An address is not only an article (30.09.2026). People paste a PDF of a
 * community register, a scan of a ketubah, a recording of an interview, a film
 * on a museum's own server. Each of those is the material itself, and the
 * archive can hold it exactly as if it had been uploaded, which is better than
 * holding a sentence about it. So the type decides:
 *
 *   page   read the words, keep them as a capture beside the lead image
 *   file   download the thing itself and put it through the ordinary pipeline
 *   no     something the archive cannot hold, and says so plainly
 */
export function captureKind(contentType: string): 'page' | 'file' | 'no' {
  const type = contentType.split(';')[0].trim().toLowerCase();
  if (!type) return 'no';
  if (/^(text\/html|application\/xhtml\+xml)$/.test(type)) return 'page';
  if (type === 'application/pdf') return 'file';
  if (/^(image|audio|video)\//.test(type)) return 'file';
  // Plain text is a file the archive already accepts; anything else - a Word
  // document, a spreadsheet, an archive - is not in the bucket's allow-list,
  // and pretending otherwise would fail later with a worse message.
  if (type === 'text/plain') return 'file';
  return 'no';
}

/**
 * Is this refusal one that a public archive copy might answer instead?
 *
 * A growing share of sites answer a server with a bot challenge rather than
 * their article - the Jewish Museum's own page does (30.09.2026, the failure
 * that prompted this). The archive does not try to defeat the challenge. It
 * asks the Internet Archive, which is a public service that already holds a
 * copy of most such pages, and says on the record that this is what it read.
 *
 * 401 and 404 are not in the list: the first is private material and the
 * second never existed at that address, and neither is ours to work around.
 */
export function mightBeArchived(status: number): boolean {
  return status === 403 || status === 406 || status === 429 || status === 451 || status >= 500;
}

/** A file name for something fetched from an address, with a sane extension. */
export function fileNameFor(url: URL, mimeType: string): string {
  const last = url.pathname.split('/').filter(Boolean).pop() ?? '';
  const cleaned = decodeURIComponent(last).replace(/[^\w.\- ]+/g, '').slice(0, 80);
  if (cleaned && /\.[a-z0-9]{2,5}$/i.test(cleaned)) return cleaned;
  const extension =
    { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/tiff': 'tif', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'text/plain': 'txt' }[
      mimeType.split(';')[0].trim().toLowerCase()
    ] ?? 'bin';
  const base = cleaned || url.hostname.replace(/^www\./, '');
  return `${base}.${extension}`;
}
