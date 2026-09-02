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

/**
 * An exact host list, never a substring match.
 *
 * `youtube.com.evil.test` contains "youtube.com", and matching on that would
 * hand an attacker-controlled page to the oEmbed path to be trusted as a
 * description of a video.
 */
export function isVideoHost(url: URL): boolean {
  return YOUTUBE_HOSTS.includes(url.hostname.toLowerCase());
}
