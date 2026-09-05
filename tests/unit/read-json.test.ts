import { describe, expect, it } from 'vitest';
import { readJson } from '@/lib/api';

/**
 * Reading a request body without turning the client's mistake into ours.
 *
 * Every route parsed the body inside the `try` whose `catch` answers 500, so a
 * POST with an empty or malformed body was reported as a server error.
 * Measured against production before the fix: `/api/items`, `/api/uploads/sign`,
 * `/api/analyze`, `/api/links/ingest` and `/api/translate` all returned 500 for
 * a body of `not json`, while the volunteer-only routes returned 401 purely
 * because they check the session before they read anything.
 *
 * That is not cosmetic. A 500 is the archive saying *it* broke, and a stream of
 * them from a bot probing with junk is exactly the noise that hides a real one.
 */
describe('reading a JSON request body', () => {
  it('returns the body when it is JSON', async () => {
    const request = new Request('https://example.test/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'A ketubah from Cochin' }),
    });
    await expect(readJson(request)).resolves.toEqual({ title: 'A ketubah from Cochin' });
  });

  it('returns undefined for a body that is not JSON, rather than throwing', async () => {
    const request = new Request('https://example.test/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    await expect(readJson(request)).resolves.toBeUndefined();
  });

  it('returns undefined for no body at all', async () => {
    const request = new Request('https://example.test/', { method: 'POST' });
    await expect(readJson(request)).resolves.toBeUndefined();
  });

  it('hands the schema something it can reject as a field, not as a crash', async () => {
    // The whole point: `undefined` fails an object schema the same way a
    // missing field does, so the route needs no special case and the caller
    // gets one 400 in the shape it already understands.
    const { z } = await import('zod');
    const Body = z.object({ title: z.string() });
    const request = new Request('https://example.test/', { method: 'POST', body: '{' });
    const parsed = Body.safeParse(await readJson(request));
    expect(parsed.success).toBe(false);
  });
});
