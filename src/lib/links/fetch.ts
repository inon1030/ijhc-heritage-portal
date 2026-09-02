import 'server-only';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isPrivateAddress, isVideoHost, parseTarget, type LinkRejection } from './policy';

// Re-exported so callers have one import for the feature; the rules themselves
// live in policy.ts, which a test runner can load.
export { isPrivateAddress, isVideoHost, parseTarget } from './policy';
export type { LinkRejection } from './policy';

/**
 * Fetching an address a stranger typed.
 *
 * This is the most dangerous route in the archive, and it is worth saying why
 * before saying what it does. Everything else here runs on bytes a contributor
 * uploaded; this runs on a *request the server makes on their behalf*. The
 * server sits inside a network that a visitor does not — it can reach the cloud
 * metadata endpoint, anything on localhost, anything on a private subnet. A
 * naive `fetch(url)` hands a stranger the server's network position. That is
 * server-side request forgery, and "we only show them the text" is not a
 * defence when the text is a set of credentials.
 *
 * So every address is resolved to an IP before it is fetched, the IP is checked
 * against every range that is not the public internet, and the check is
 * repeated after each redirect — because a redirect is a second address, chosen
 * by whoever answered the first.
 */

/** Beyond this the page is not an article and is not worth the memory. */
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;

/** Enough of an article to catalogue; far short of what a model will read for free. */
const MAX_TEXT_CHARS = 24_000;

export interface CapturedLink {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  /** Readable body text, stripped of markup. Empty for a video. */
  text: string;
  /** The page's own lead image, when it names one. */
  imageUrl: string | null;
  /** Set for a video, which the archive can describe but cannot watch. */
  video: { provider: string; author: string | null } | null;
}

/** Resolves a host and refuses anything that is not on the public internet. */
async function assertPublicHost(url: URL): Promise<LinkRejection | null> {
  const host = url.hostname;

  const literal = isIP(host);
  if (literal) {
    return isPrivateAddress(host)
      ? { code: 'blocked_host', message: 'That address is on a private network.' }
      : null;
  }

  try {
    const resolved = await lookup(host, { all: true });
    if (!resolved.length) {
      return { code: 'unreachable', message: 'That address could not be resolved.' };
    }
    // Every answer must be public: one private record among several is enough
    // to reach the private one.
    if (resolved.some((entry) => isPrivateAddress(entry.address))) {
      return { code: 'blocked_host', message: 'That address resolves to a private network.' };
    }
    return null;
  } catch {
    return { code: 'unreachable', message: 'That address could not be resolved.' };
  }
}

/**
 * Fetches one address, checking every hop.
 *
 * `redirect: 'manual'` rather than letting fetch follow, because a followed
 * redirect is a request to an address that was never checked.
 */
async function guardedFetch(
  target: URL,
  accept: string,
): Promise<{ response: Response; url: URL } | { rejection: LinkRejection }> {
  let url = target;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const blocked = await assertPublicHost(url);
    if (blocked) return { rejection: blocked };

    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          // Named honestly. A site that does not want an archive reading it can
          // say so, and a server that lies about who it is deserves what it gets.
          'User-Agent': 'IJHC-Heritage-Archive/1.0 (+https://heritage-portal-snowy.vercel.app)',
          Accept: accept,
        },
      });
    } catch {
      return { rejection: { code: 'unreachable', message: 'That page did not answer.' } };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return { rejection: { code: 'unreachable', message: 'That page redirected to nowhere.' } };
      }
      try {
        url = new URL(location, url);
      } catch {
        return { rejection: { code: 'unreachable', message: 'That page redirected somewhere unreadable.' } };
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { rejection: { code: 'blocked_host', message: 'That page redirected off the web.' } };
      }
      continue;
    }

    if (!response.ok) {
      return {
        rejection: { code: 'unreachable', message: `That page answered ${response.status}.` },
      };
    }

    return { response, url };
  }

  return { rejection: { code: 'unreachable', message: 'That address redirects in circles.' } };
}

/** Reads a body, refusing anything oversized rather than buffering it first. */
async function readCapped(response: Response): Promise<Uint8Array | LinkRejection> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > MAX_BYTES) {
    return { code: 'too_large', message: 'That page is too large to read.' };
  }

  const reader = response.body?.getReader();
  if (!reader) return { code: 'not_readable', message: 'That page had no content.' };

  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return { code: 'too_large', message: 'That page is too large to read.' };
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

const entities: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", mdash: '—', ndash: '–',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
    const key = name.toLowerCase();
    if (entities[key]) return entities[key];

    // `String.fromCodePoint` throws RangeError above 0x10FFFF, so a page
    // carrying `&#999999999;` — broken or deliberate — used to 500 the whole
    // capture. Out-of-range entities are left as written instead.
    if (key.startsWith('#')) {
      const point = key.startsWith('#x') ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      if (!Number.isInteger(point) || point < 0 || point > 0x10ffff) return whole;
      return String.fromCodePoint(point);
    }

    return whole;
  });
}

function meta(html: string, property: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`,
    'i',
  );
  const alternate = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
    'i',
  );
  const found = html.match(pattern) ?? html.match(alternate);
  return found ? decodeEntities(found[1]).trim() || null : null;
}

/**
 * The readable text of a page.
 *
 * Not a full reader implementation — script, style, and the furniture come out,
 * tags are dropped, whitespace is collapsed. An archivist is cataloguing what a
 * page is *about*; the model does not need the navigation menu, and paying to
 * send it one would be silly.
 */
function readableText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(nav|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

/**
 * A video, described from what its host publishes about it.
 *
 * The archive does not watch it. YouTube does not hand out the media, and
 * pretending otherwise would put a confident description of footage nobody
 * examined into a heritage record. What comes back is the title, the channel,
 * and the thumbnail — which is honest, is usually enough to catalogue by, and
 * is labelled as such on the record.
 */
async function captureVideo(url: URL): Promise<CapturedLink | LinkRejection> {
  const oembed = new URL('https://www.youtube.com/oembed');
  oembed.searchParams.set('url', url.toString());
  oembed.searchParams.set('format', 'json');

  const result = await guardedFetch(oembed, 'application/json');
  if ('rejection' in result) return result.rejection;

  const body = await readCapped(result.response);
  if (!(body instanceof Uint8Array)) return body;

  try {
    const data = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
    const title = typeof data.title === 'string' ? data.title : null;
    const author = typeof data.author_name === 'string' ? data.author_name : null;

    return {
      url: url.toString(),
      title,
      description: null,
      siteName: 'YouTube',
      text: [
        `Video: ${title ?? 'untitled'}`,
        author ? `Channel: ${author}` : null,
        `Address: ${url.toString()}`,
        '',
        'The archive has not watched this video. What follows was published by the host about it, and the still below is its thumbnail.',
      ]
        .filter(Boolean)
        .join('\n'),
      imageUrl: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : null,
      video: { provider: 'YouTube', author },
    };
  } catch {
    return { code: 'not_readable', message: 'YouTube did not describe that video.' };
  }
}

/** Reads one address into something the archive can catalogue. */
export async function captureLink(raw: string): Promise<CapturedLink | LinkRejection> {
  const parsed = parseTarget(raw);
  if ('rejection' in parsed) return parsed.rejection;

  if (isVideoHost(parsed.url)) return captureVideo(parsed.url);

  const result = await guardedFetch(parsed.url, 'text/html,application/xhtml+xml');
  if ('rejection' in result) return result.rejection;

  const type = result.response.headers.get('content-type') ?? '';
  if (!/text\/html|application\/xhtml/i.test(type)) {
    return {
      code: 'not_readable',
      message: 'That address is not a web page. Download the file and upload it instead.',
    };
  }

  const body = await readCapped(result.response);
  if (!(body instanceof Uint8Array)) return body;

  const html = new TextDecoder('utf-8').decode(body);
  const text = readableText(html);

  if (text.length < 200) {
    return {
      code: 'not_readable',
      message: 'That page had almost no text to read. It may need JavaScript to show its content.',
    };
  }

  const image = meta(html, 'og:image') ?? meta(html, 'twitter:image');

  return {
    // The address after redirects: what was actually read, not what was typed.
    url: result.url.toString(),
    title: meta(html, 'og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null,
    description: meta(html, 'og:description') ?? meta(html, 'description'),
    siteName: meta(html, 'og:site_name'),
    text,
    imageUrl: image ? new URL(image, result.url).toString() : null,
    video: null,
  };
}

/** Fetches a page's lead image, with the same guards. Null rather than failing. */
export async function fetchImage(
  rawUrl: string,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const parsed = parseTarget(rawUrl);
  if ('rejection' in parsed) return null;

  const result = await guardedFetch(parsed.url, 'image/*');
  if ('rejection' in result) return null;

  const type = (result.response.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!type.startsWith('image/')) return null;

  const body = await readCapped(result.response);
  if (!(body instanceof Uint8Array)) return null;

  return { bytes: body, mimeType: type };
}
