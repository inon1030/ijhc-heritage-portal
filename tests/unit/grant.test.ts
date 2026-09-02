import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The upload grant.
 *
 * `/api/analyze` reads storage with the service-role client and sends what it
 * finds to a paid model; `/api/items` attaches a path to a record. Before this
 * existed, the only thing between an anonymous caller and any object in the
 * bucket was the uuid in the key — a capability URL doing the job of an access
 * control. These tests are the forgery attempts an attacker would actually
 * make.
 */

// The module derives its key from the service-role key at call time, so the
// environment has to look like a configured server before it is imported.
beforeAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-for-grant-derivation';
});

const load = async () => await import('@/lib/files/grant');

const PATH = 'uploads/2026/08/8f14e45f-ea8d-4b7a-b0a2-1c2d3e4f5a6b-scan.jpg';

describe('a grant proves the path came from here', () => {
  it('accepts the grant it just issued', async () => {
    const { issueGrant, verifyGrant } = await load();
    const { grant, expiresAt } = issueGrant(PATH);
    expect(verifyGrant(PATH, expiresAt, grant)).toBe(true);
  });

  it('refuses a grant issued for a different path', async () => {
    // The whole point: holding one valid path must not unlock the bucket.
    const { issueGrant, verifyGrant } = await load();
    const { grant, expiresAt } = issueGrant(PATH);
    expect(verifyGrant('uploads/2026/08/someone-elses-file.jpg', expiresAt, grant)).toBe(false);
  });

  it('refuses a grant whose expiry was edited to extend it', async () => {
    const { issueGrant, verifyGrant } = await load();
    const { grant, expiresAt } = issueGrant(PATH);
    expect(verifyGrant(PATH, expiresAt + 60_000, grant)).toBe(false);
  });

  it('refuses an expired grant even when the signature is genuine', async () => {
    const { grantFor, verifyGrant } = await load();
    const past = Date.now() - 1_000;
    expect(verifyGrant(PATH, past, grantFor(PATH, past))).toBe(false);
  });

  it('refuses a forged, truncated, or absent grant', async () => {
    const { issueGrant, verifyGrant } = await load();
    const { expiresAt, grant } = issueGrant(PATH);

    expect(verifyGrant(PATH, expiresAt, 'not-a-real-grant')).toBe(false);
    expect(verifyGrant(PATH, expiresAt, grant.slice(0, -1))).toBe(false);
    expect(verifyGrant(PATH, expiresAt, '')).toBe(false);
    expect(verifyGrant(PATH, expiresAt, undefined)).toBe(false);
    expect(verifyGrant(PATH, undefined, grant)).toBe(false);
    expect(verifyGrant(PATH, 'soon' as unknown as number, grant)).toBe(false);
  });

  it('refuses a grant for a path that merely starts the same', async () => {
    // Guards against a signature over a prefix being replayed for a longer key.
    const { issueGrant, verifyGrant } = await load();
    const { grant, expiresAt } = issueGrant(PATH);
    expect(verifyGrant(`${PATH}/../../secrets.txt`, expiresAt, grant)).toBe(false);
  });
});
