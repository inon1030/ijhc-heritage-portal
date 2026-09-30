import 'server-only';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import {
  captureKind,
  fileNameFor,
  isPrivateAddress,

  mightBeArchived,
  parseTarget,
  videoProvider,
  type LinkRejection,
} from './policy';

// Re-exported so callers have one import for the feature; the rules themselves
// live in policy.ts, which a test runner can load.
export { captureKind, isPrivateAddress, isVideoHost, parseTarget, videoProvider } from './policy';
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
/** A file behind an address is the material itself, and gets the archive's own ceiling. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;

/** Enough of an article to catalogue; far short of what a model will read for free. */
const MAX_TEXT_CHARS = 24_000;

export interface CapturedLink {
  /** Discriminates the two shapes a capture can take; see `CapturedFile`. */
  kind: 'page';
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
  /** The public archive copy this was read from, when the site refused the server. */
  archivedFrom?: string | null;
}

/**
 * The material itself, fetched from an address.
 *
 * A PDF, a scan, a recording, a film. It goes through the same pipeline as an
 * uploaded file: the same type check, the same reading, the same review.
 */
export interface CapturedFile {
  kind: 'file';
  url: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
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
): Promise<{ response: Response; url: URL } | { rejection: LinkRejection; status?: number }> {
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
        status: response.status,
      };
    }

    return { response, url };
  }

  return { rejection: { code: 'unreachable', message: 'That address redirects in circles.' } };
}

/** Reads a body, refusing anything oversized rather than buffering it first. */
async function readCapped(response: Response, cap: number = MAX_BYTES): Promise<Uint8Array | LinkRejection> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > cap) {
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
    if (total > cap) {
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
async function captureVideo(url: URL, provider: 'youtube' | 'vimeo'): Promise<CapturedLink | LinkRejection> {
  const name = provider === 'youtube' ? 'YouTube' : 'Vimeo';
  const oembed = new URL(
    provider === 'youtube' ? 'https://www.youtube.com/oembed' : 'https://vimeo.com/api/oembed.json',
  );
  oembed.searchParams.set('url', url.toString());
  if (provider === 'youtube') oembed.searchParams.set('format', 'json');

  const result = await guardedFetch(oembed, 'application/json');
  if ('rejection' in result) return result.rejection;

  const body = await readCapped(result.response);
  if (!(body instanceof Uint8Array)) return body;

  try {
    const data = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
    const title = typeof data.title === 'string' ? data.title : null;
    const author = typeof data.author_name === 'string' ? data.author_name : null;

    return {
      kind: 'page',
      url: url.toString(),
      title,
      description: null,
      siteName: name,
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
      video: { provider: name, author },
    };
  } catch {
    return { code: 'not_readable', message: name + ' did not describe that video.' };
  }
}

/**
 * The Internet Archive's copy of a page, when the site itself refuses us.
 *
 * Asked for, not worked around: the availability API answers with the closest
 * snapshot it holds, and that snapshot is fetched through the same guards as
 * everything else. Null when there is no copy, which is an honest answer too.
 */
async function archivedCopy(url: URL): Promise<URL | null> {
  const query = new URL('https://archive.org/wayback/available');
  query.searchParams.set('url', url.toString().replace(/^https?:\/\//, ''));

  const result = await guardedFetch(query, 'application/json');
  if ('rejection' in result) return null;

  const body = await readCapped(result.response);
  if (!(body instanceof Uint8Array)) return null;

  try {
    const data = JSON.parse(new TextDecoder().decode(body)) as {
      archived_snapshots?: { closest?: { available?: boolean; url?: string } };
    };
    const closest = data.archived_snapshots?.closest;
    if (!closest?.available || !closest.url) return null;
    // `id_` after the timestamp asks for the page as it was captured, without
    // the toolbar the Wayback Machine otherwise injects into the markup.
    return new URL(closest.url.replace(/^http:/, 'https:').replace(/\/(\d{14})\//, '/$1id_/'));
  } catch {
    return null;
  }
}

/** One address, read. Shared by the live page and by its archived copy. */
async function capturePage(
  target: URL,
  source: URL,
  archivedFrom: string | null,
): Promise<CapturedLink | CapturedFile | (LinkRejection & { status?: number })> {
  const result = await guardedFetch(
    target,
    'text/html,application/xhtml+xml,application/pdf,image/*,audio/*,video/*,text/plain;q=0.8,*/*;q=0.5',
  );
  if ('rejection' in result) return { ...result.rejection, status: result.status };

  const type = result.response.headers.get('content-type') ?? '';
  const kind = captureKind(type);

  if (kind === 'no') {
    return {
      code: 'not_readable',
      message: 'The archive cannot hold that kind of file. Download it and upload it instead.',
    };
  }

  if (kind === 'file') {
    const bytes = await readCapped(result.response, MAX_FILE_BYTES);
    if (!(bytes instanceof Uint8Array)) return bytes;
    const mimeType = type.split(';')[0].trim().toLowerCase();
    return {
      kind: 'file',
      url: source.toString(),
      fileName: fileNameFor(result.url, mimeType),
      mimeType,
      bytes,
    };
  }

  const body = await readCapped(result.response);
  if (!(body instanceof Uint8Array)) return body;

  const html = new TextDecoder('utf-8').decode(body);
  const text = readableText(html);
  const title =
    meta(html, 'og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null;
  const description = meta(html, 'og:description') ?? meta(html, 'description');

  /*
   * A page that says almost nothing is usually one that draws itself with
   * JavaScript. What it publishes about itself for a link preview is still
   * worth keeping when it has it, and the record shows it is all there was.
   */
  if (text.length < 200 && !(title && description)) {
    return {
      code: 'not_readable',
      message: 'That page had almost no text to read. It may need JavaScript to show its content.',
    };
  }

  const image = meta(html, 'og:image') ?? meta(html, 'twitter:image');

  return {
    kind: 'page',
    url: source.toString(),
    title,
    description,
    siteName: meta(html, 'og:site_name'),
    text: text.length < 200 ? [title, description].filter(Boolean).join('\n\n') : text,
    imageUrl: image ? new URL(image, result.url).toString() : null,
    video: null,
    archivedFrom,
  };
}

/**
 * Reads one address into something the archive can catalogue.
 *
 * Three shapes, in the order they are tried: a video on a host that publishes
 * a description of it; the material itself, when the address is a file; the
 * words of a page otherwise. When a site answers the server with a refusal -
 * a bot challenge, most often - the public archive's copy is read instead and
 * the record says so.
 */
export async function captureLink(raw: string): Promise<CapturedLink | CapturedFile | LinkRejection> {
  const parsed = parseTarget(raw);
  if ('rejection' in parsed) return parsed.rejection;

  /*
   * A video first, described from what its host publishes. When the host has
   * nothing to say about it - taken down, made private, or simply an address
   * on the site that is not a video - the page itself is read instead, rather
   * than the whole link being refused.
   */
  const provider = videoProvider(parsed.url);
  if (provider) {
    const video = await captureVideo(parsed.url, provider);
    if (!('code' in video)) return video;
  }

  const name = provider === 'youtube' ? 'YouTube' : provider === 'vimeo' ? 'Vimeo' : null;
  const first = await capturePage(parsed.url, parsed.url, null);
  if (!('code' in first)) {
    // Read as a page, but still a video as far as the record is concerned, and
    // still one the archive has not watched.
    if (name && first.kind === 'page' && !first.video) first.video = { provider: name, author: null };
    return first;
  }

  const refused = typeof first.status === 'number' && mightBeArchived(first.status);
  if (refused || first.code === 'not_readable') {
    const snapshot = await archivedCopy(parsed.url);
    if (snapshot) {
      const second = await capturePage(snapshot, parsed.url, snapshot.toString());
      if (!('code' in second)) return second;
    }
  }

  if (refused) {
    return {
      code: 'not_readable',
      message:
        'That site does not let an archive read it, and no public copy of the page exists. Save the page as a PDF and upload that instead.',
    };
  }

  return { code: first.code, message: first.message };
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
