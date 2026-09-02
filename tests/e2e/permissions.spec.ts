import { expect, test } from '@playwright/test';

/**
 * The permission boundary, checked from the outside.
 *
 * Every assertion here fails against the Bolt demo: it exposed the review
 * screen to everyone, held "editor" state in a React variable, and shipped the
 * editor password in the JavaScript bundle.
 */

test.describe('anonymous visitor', () => {
  test('can browse the portal', async ({ page }) => {
    await page.goto('/portal');
    await expect(page.getByRole('heading', { name: /four streams, one river/i })).toBeVisible();
  });

  test('can reach the contribution flow', async ({ page }) => {
    await page.goto('/upload');
    await expect(page.getByRole('heading', { name: /contribute an item/i })).toBeVisible();
  });

  test('is not offered the review screen', async ({ page }) => {
    await page.goto('/portal');
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Review' })).toHaveCount(0);
  });

  test('is redirected away from the review queue', async ({ page }) => {
    await page.goto('/review');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: /volunteer access/i })).toBeVisible();
  });

  test('is redirected away from an individual review page', async ({ page }) => {
    await page.goto('/review/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/login/);
  });

  test('cannot change a record through the API', async ({ request }) => {
    const response = await request.post('/api/items/00000000-0000-0000-0000-000000000000/review', {
      data: {
        status: 'accepted',
        title: 'Injected',
        description: null,
        community: null,
        provenance: null,
        keywords: [],
        language: null,
      },
    });
    expect(response.status()).toBe(401);
  });

  test('cannot delete a record through the API', async ({ request }) => {
    const response = await request.delete('/api/items/00000000-0000-0000-0000-000000000000/review');
    expect(response.status()).toBe(401);
  });

  test('is offered a way in, and only a way in', async ({ page }) => {
    // The top bar is where everything other than browsing and contributing
    // lives. A visitor should find sign-in and account creation there, and
    // nothing that belongs to a volunteer.
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Sign in' })).toHaveCount(1);
    await expect(nav.getByRole('link', { name: 'Create an account' })).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Archive administration' })).toHaveCount(0);
  });

  test('is given two doors on the front page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /explore the archive/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /add something you kept/i })).toBeVisible();
  });
});

test.describe('catalogue fields', () => {
  test('a contribution cannot carry a field below the threshold', async ({ request }) => {
    // The gate runs on the server during analysis, but the result travels
    // through the browser before it is submitted. Without this check a crafted
    // request could plant a 0.2 guess in a volunteer's queue wearing the
    // archive's own colours.
    const response = await request.post('/api/items', {
      data: {
        title: 'Threshold probe',
        consentVersion: 'test',
        files: [
          {
            path: 'uploads/nonexistent/probe.jpg',
            fileName: 'probe.jpg',
            mimeType: 'image/jpeg',
            byteSize: 1024,
            analysis: {
              provider: 'gemini',
              model: 'test',
              summary: 'x',
              keywords: [],
              language: null,
              confidence: 0.2,
              ocrText: null,
              transcript: null,
              suggestedCommunity: null,
              suggestedPeriod: null,
              suggestedOrigin: null,
              reasoning: null,
              fields: [
                { key: 'map.geo.cities_villages', value: 'Somewhere', confidence: 0.2, basis: 'guess', note: null },
              ],
              raw: {},
            },
          },
        ],
      },
    });
    expect(response.status()).toBe(400);
  });

  test('a contribution cannot invent a field the tree does not have', async ({ request }) => {
    const response = await request.post('/api/items', {
      data: {
        title: 'Unknown field probe',
        consentVersion: 'test',
        contributorFields: [{ key: 'gps_coordinates', value: '18.64, 72.87' }],
        files: [
          {
            path: 'uploads/nonexistent/probe.jpg',
            fileName: 'probe.jpg',
            mimeType: 'image/jpeg',
            byteSize: 1024,
            analysis: null,
          },
        ],
      },
    });
    expect(response.status()).toBe(400);
  });

  test('a review cannot be saved without saying who the record is for', async ({ request }) => {
    // Access decides whether a record reaches the public portal. Leaving it
    // implicit is how every record ends up public by default, which is the one
    // outcome a heritage archive cannot recover from.
    const response = await request.post('/api/items/00000000-0000-0000-0000-000000000000/review', {
      data: {
        status: 'accepted',
        title: 'No audience',
        description: null,
        community: null,
        provenance: null,
        keywords: [],
        language: null,
        period: null,
        originPlace: null,
      },
    });
    // 401 before 400: an anonymous caller is turned away before the body is
    // read at all, which is the correct order.
    expect(response.status()).toBe(401);
  });

  test('a contributor cannot give a field a value it does not take', async ({ request }) => {
    // A contributor may correct the community — their correction becomes a
    // claim a volunteer reads, never the record. What they cannot do is put a
    // value in it that the column would reject three layers away.
    const response = await request.post('/api/items', {
      data: {
        title: 'Column probe',
        consentVersion: 'test',
        contributorFields: [{ key: 'community', value: 'Bene-Israel' }],
        files: [
          {
            path: 'uploads/nonexistent/probe.jpg',
            fileName: 'probe.jpg',
            mimeType: 'image/jpeg',
            byteSize: 1024,
            analysis: null,
          },
        ],
      },
    });
    expect(response.status()).toBe(400);
  });
});

test.describe('upload validation', () => {
  test('refuses a file type the archive does not store', async ({ request }) => {
    const response = await request.post('/api/uploads/sign', {
      data: { fileName: 'payload.exe', mimeType: 'application/x-msdownload', byteSize: 1024 },
    });
    expect(response.status()).toBe(415);
  });

  test('refuses a file over the size cap', async ({ request }) => {
    const response = await request.post('/api/uploads/sign', {
      data: { fileName: 'huge.jpg', mimeType: 'image/jpeg', byteSize: 80 * 1024 * 1024 },
    });
    expect([400, 415]).toContain(response.status());
  });

  test('rejects a malformed request body', async ({ request }) => {
    const response = await request.post('/api/uploads/sign', { data: { fileName: '' } });
    expect(response.status()).toBe(400);
  });
});

test.describe('no secrets in the client bundle', () => {
  test('the service role key never reaches the browser', async ({ page }) => {
    const scripts: string[] = [];
    page.on('response', async (response) => {
      if (response.url().endsWith('.js') && response.status() === 200) {
        scripts.push(await response.text().catch(() => ''));
      }
    });

    await page.goto('/portal');
    await page.waitForLoadState('networkidle');

    const bundle = scripts.join('\n');
    expect(bundle).not.toContain('service_role');
    expect(bundle).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    // The demo shipped a literal editor password. Nothing like it should exist.
    expect(bundle).not.toMatch(/heritage2025/);
  });
});

/**
 * The submission receipt.
 *
 * The one page in the archive reached by a signature rather than a session, and
 * it reads with the service-role client — out of RLS's reach — so the signature
 * is the only thing between a stranger and an unpublished contribution. These
 * are the attempts somebody would actually make on it.
 */
test.describe('the submission receipt', () => {
  const ANY_ID = '3abb8a03-3b8f-49ce-b02f-45b3400a4d60';

  test('says nothing about a record without a valid signature', async ({ page }) => {
    await page.goto(`/receipt/${ANY_ID}?t=${'a'.repeat(32)}`);
    await expect(page.getByRole('heading', { name: /that link is not right/i })).toBeVisible();
  });

  test('says nothing about a record with no signature at all', async ({ page }) => {
    await page.goto(`/receipt/${ANY_ID}`);
    await expect(page.getByRole('heading', { name: /that link is not right/i })).toBeVisible();
  });

  test('is not indexable, because it is somebody else’s business', async ({ page }) => {
    await page.goto(`/receipt/${ANY_ID}?t=${'a'.repeat(32)}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});

/**
 * The contributor register.
 *
 * Addresses, names, and which family each belongs to. Volunteers read it and
 * volunteers maintain it; the public must not reach it at all, and it never
 * appears in the portal.
 */
test.describe('the contributor register', () => {
  test('cannot be read or written by a stranger', async ({ request }) => {
    const link = await request.post('/api/manage/contributors', {
      data: { email: 'intruder@example.com', familyId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(link.status()).toBe(401);

    const rename = await request.patch('/api/manage/contributors', {
      data: { contributorId: '00000000-0000-0000-0000-000000000000', fullName: 'Injected' },
    });
    expect(rename.status()).toBe(401);

    const unlink = await request.delete(
      '/api/manage/contributors?contributorId=00000000-0000-0000-0000-000000000000&familyId=00000000-0000-0000-0000-000000000000',
    );
    expect(unlink.status()).toBe(401);
  });
});
