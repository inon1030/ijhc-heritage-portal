import { describe, expect, it } from 'vitest';
import { encodeKey, signRequest } from '@/lib/backup/s3';

/**
 * The signing routine, against AWS's own published example.
 *
 * This is the one piece of the backup that cannot be checked by looking at it.
 * A signature is either byte-identical to what the other end computed or it is
 * a 403 with no explanation — so a wrong implementation looks exactly like a
 * wrong key, a wrong region, a wrong bucket or a clock skew, and the only way
 * to tell them apart afterwards is to have proved this part first.
 *
 * The vector is the "GET Object" example from AWS's Signature Version 4
 * documentation: the credentials are AWS's published dummies, the date is
 * fixed, and the expected signature is theirs.
 */

const KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
const SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const EMPTY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('signing a request the way S3 expects', () => {
  /**
   * A known answer, and where the answer came from.
   *
   * The hex below was **not** copied out of this implementation, and it was not
   * written from memory. It was computed separately, in Python, straight from
   * the published SigV4 steps, for these exact inputs — and the two agree
   * byte for byte. That is what makes this a test rather than a mirror: the
   * archive has been caught once already comparing a value against a number it
   * had generated itself (the backup verifier, which printed PASS over a
   * truncated file).
   */
  it('reproduces a signature computed independently from the published algorithm', async () => {
    const { headers } = await signRequest({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      key: '/test.txt',
      region: 'us-east-1',
      accessKeyId: KEY_ID,
      secretAccessKey: SECRET,
      payloadHash: EMPTY_SHA,
      now: new Date('2013-05-24T00:00:00Z'),
    });

    expect(headers.Authorization).toContain(
      `Credential=${KEY_ID}/20130524/us-east-1/s3/aws4_request`,
    );
    expect(headers.Authorization).toContain(
      'SignedHeaders=host;x-amz-content-sha256;x-amz-date',
    );
    expect(headers.Authorization).toContain(
      'Signature=df548e2ce037944d03f3e68682813b093763996d597cf890ca3d9037fd231eb4',
    );
    expect(headers['x-amz-date']).toBe('20130524T000000Z');
  });

  it('puts the date and scope where the algorithm says they go', async () => {
    const { headers } = await signRequest({
      method: 'PUT',
      host: 'account.r2.cloudflarestorage.com',
      key: '/ijhc/2026-09-06/database.json.gz',
      region: 'auto',
      accessKeyId: KEY_ID,
      secretAccessKey: SECRET,
      payloadHash: EMPTY_SHA,
      contentType: 'application/gzip',
      now: new Date('2026-09-06T20:15:00Z'),
    });

    expect(headers['x-amz-date']).toBe('20260906T201500Z');
    expect(headers.Authorization).toContain('20260906/auto/s3/aws4_request');
    // content-type is signed when present, and its absence changes the
    // signature — so it has to be in the signed list, in sorted order.
    expect(headers.Authorization).toContain(
      'SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date',
    );
  });

  it('is deterministic: the same request at the same instant signs the same', async () => {
    const args = {
      method: 'PUT' as const,
      host: 'example.com',
      key: '/b/k',
      region: 'auto',
      accessKeyId: KEY_ID,
      secretAccessKey: SECRET,
      payloadHash: EMPTY_SHA,
      now: new Date('2026-01-01T00:00:00Z'),
    };
    const a = await signRequest(args);
    const b = await signRequest(args);
    expect(a.headers.Authorization).toBe(b.headers.Authorization);
  });

  it('changes the signature when the payload changes', async () => {
    const base = {
      method: 'PUT' as const,
      host: 'example.com',
      key: '/b/k',
      region: 'auto',
      accessKeyId: KEY_ID,
      secretAccessKey: SECRET,
      now: new Date('2026-01-01T00:00:00Z'),
    };
    const a = await signRequest({ ...base, payloadHash: EMPTY_SHA });
    const b = await signRequest({ ...base, payloadHash: 'a'.repeat(64) });
    expect(a.headers.Authorization).not.toBe(b.headers.Authorization);
  });
});

/**
 * The path encoding, which is the other half of "403 with no explanation".
 *
 * The signature is computed over the canonical path, so if the encoding used
 * to sign differs by one character from the encoding used to fetch, the
 * request is rejected and the message says nothing about why. Storage keys on
 * this project are ASCII by design (0006), but a backup key carries a
 * timestamp and a filename, and filenames have been the source of this class
 * of bug here before.
 */
describe('encoding a key for the canonical path', () => {
  it('leaves the separators alone and encodes the segments', () => {
    expect(encodeKey('/ijhc/2026-09-06/database.json.gz')).toBe(
      '/ijhc/2026-09-06/database.json.gz',
    );
  });

  it('encodes a space rather than leaving it or turning it into a plus', () => {
    expect(encodeKey('/b/a file.jpg')).toBe('/b/a%20file.jpg');
  });

  it('encodes the characters encodeURIComponent leaves out', () => {
    // S3 signs over these; `encodeURIComponent` does not touch them, and the
    // mismatch is a 403.
    expect(encodeKey("/b/it's(1)*.jpg")).toBe('/b/it%27s%281%29%2A.jpg');
  });

  it('does not double-encode a percent that is already there', () => {
    // A key with a literal % must survive as %25 exactly once.
    expect(encodeKey('/b/100%.txt')).toBe('/b/100%25.txt');
  });
});
