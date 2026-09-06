import 'server-only';

/**
 * Signature Version 4, by hand, for one verb and one object at a time.
 *
 * ── why not the AWS SDK ─────────────────────────────────────────────────────
 *
 * `@aws-sdk/client-s3` is several megabytes to do two things: PUT an object and
 * ask whether one exists. This runs in a serverless function with a sixty
 * second ceiling, where the bundle is loaded before the work starts, and the
 * archive has exactly one dependency-weight rule: pay it where it buys
 * something. SigV4 is a published algorithm with published test vectors, so it
 * can be written in eighty lines and *proved* rather than trusted.
 *
 * ── why S3 and not a named provider ─────────────────────────────────────────
 *
 * Cloudflare R2, Backblaze B2 and S3 itself all speak this. The destination is
 * four environment variables, so the archive is not married to whichever one
 * gets set up — and moving it later is a change to Vercel's settings rather
 * than to this repository.
 */

const ENCODER = new TextEncoder();

async function sha256(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? ENCODER.encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return hex(new Uint8Array(digest));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(key: Uint8Array, message: string): Promise<Uint8Array<ArrayBuffer>> {
  const imported = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', imported, ENCODER.encode(message));
  return new Uint8Array(signature);
}

/**
 * Each path segment encoded, the slashes left alone.
 *
 * `encodeURIComponent` is right for a segment and wrong for a path, and S3
 * additionally wants the characters it leaves out — `!'()*` — encoded, because
 * the signature is computed over the canonical form and a mismatch is a 403
 * with nothing to say why.
 */
export function encodeKey(key: string): string {
  return key
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
      ),
    )
    .join('/');
}

export interface Signed {
  headers: Record<string, string>;
}

/**
 * The headers that authorise one request.
 *
 * Split out from the fetch so it can be tested against AWS's own published
 * vectors — a signing routine that is only exercised through a live upload is
 * one whose failures all look like "403, try again".
 */
export async function signRequest({
  method,
  host,
  key,
  region,
  accessKeyId,
  secretAccessKey,
  payloadHash,
  contentType,
  now,
}: {
  method: 'PUT' | 'HEAD' | 'GET';
  host: string;
  key: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  payloadHash: string;
  contentType?: string;
  now: Date;
}): Promise<Signed> {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const service = 's3';
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;

  const headers: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headers['content-type'] = contentType;

  const signedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaders.map((h) => `${h}:${headers[h].trim()}\n`).join('');
  const signedHeaderList = signedHeaders.join(';');

  const canonicalRequest = [
    method,
    encodeKey(key.startsWith('/') ? key : `/${key}`),
    '',
    canonicalHeaders,
    signedHeaderList,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256(canonicalRequest),
  ].join('\n');

  let signing: Uint8Array = ENCODER.encode(`AWS4${secretAccessKey}`);
  for (const part of [dateStamp, region, service, 'aws4_request']) {
    signing = await hmac(signing, part);
  }
  const signature = hex(await hmac(signing, stringToSign));

  return {
    headers: {
      ...headers,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaderList}, Signature=${signature}`,
    },
  };
}

export interface Destination {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * The destination, or null when it is not configured.
 *
 * Null rather than a throw, because "no off-site store set up yet" is a state
 * this archive is genuinely in and the cron has to be able to say so plainly
 * instead of erroring nightly into a log nobody reads.
 */
export function destination(): Destination | null {
  const endpoint = process.env.BACKUP_S3_ENDPOINT?.trim();
  const bucket = process.env.BACKUP_S3_BUCKET?.trim();
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ''),
    bucket,
    // R2 ignores the region and wants "auto"; S3 does not. Configurable, and
    // "auto" is the answer that works on the one most likely to be used.
    region: process.env.BACKUP_S3_REGION?.trim() || 'auto',
    accessKeyId,
    secretAccessKey,
  };
}

function url(to: Destination, key: string): { href: string; host: string; path: string } {
  const base = new URL(to.endpoint);
  // Path style: `<endpoint>/<bucket>/<key>`. Virtual-host style would need the
  // bucket in the hostname, which R2's S3 endpoint does not offer by default.
  const path = `/${to.bucket}/${key}`;
  return { href: `${base.origin}${encodeKey(path)}`, host: base.host, path };
}

/** True when the object is already there, so a nightly run copies it once. */
export async function exists(to: Destination, key: string): Promise<boolean> {
  const { href, host, path } = url(to, key);
  const empty = await sha256('');
  const { headers } = await signRequest({
    method: 'HEAD',
    host,
    key: path,
    region: to.region,
    accessKeyId: to.accessKeyId,
    secretAccessKey: to.secretAccessKey,
    payloadHash: empty,
    now: new Date(),
  });
  const response = await fetch(href, { method: 'HEAD', headers });
  return response.status === 200;
}

export async function put(
  to: Destination,
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const { href, host, path } = url(to, key);
  const { headers } = await signRequest({
    method: 'PUT',
    host,
    key: path,
    region: to.region,
    accessKeyId: to.accessKeyId,
    secretAccessKey: to.secretAccessKey,
    payloadHash: await sha256(body),
    contentType,
    now: new Date(),
  });

  const response = await fetch(href, {
    method: 'PUT',
    headers: { ...headers, 'content-length': String(body.byteLength) },
    body: body as BodyInit,
  });

  if (!response.ok) {
    // The body carries S3's own reason — SignatureDoesNotMatch, NoSuchBucket,
    // AccessDenied — and without it every failure reads the same.
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new Error(`${key}: ${response.status} ${detail}`);
  }
}
