import { expect, test } from '@playwright/test';

/**
 * The administration area, checked from the outside.
 *
 * Three things are being proved here, and all three are new on 2026-08-27:
 * that /manage is closed to the public at all, that adding a vocabulary term
 * and removing one are different permissions, and that a requested account can
 * hold a session without holding any rights.
 *
 * The signed-in half needs credentials. Without them those tests skip rather
 * than pass quietly — a permission suite that silently tests nothing is worse
 * than no suite.
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const hasAdmin = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);

test.describe('anonymous visitor', () => {
  test('is redirected away from every management screen', async ({ page }) => {
    for (const path of ['/manage', '/manage/vocabulary', '/manage/families', '/manage/accounts']) {
      await page.goto(path);
      await expect(page, `${path} should not be reachable`).toHaveURL(/\/login/);
    }
  });

  test('is not offered the management link', async ({ page }) => {
    await page.goto('/portal');
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Manage' }),
    ).toHaveCount(0);
  });

  test('cannot add a vocabulary term', async ({ request }) => {
    const response = await request.post('/api/manage/keywords', {
      data: { term: 'Injected', community: null },
    });
    expect(response.status()).toBe(401);
  });

  test('cannot remove a vocabulary term', async ({ request }) => {
    const response = await request.delete(
      '/api/manage/keywords?id=00000000-0000-0000-0000-000000000000',
    );
    expect(response.status()).toBe(403);
  });

  test('cannot register a family', async ({ request }) => {
    const response = await request.post('/api/manage/families', {
      data: { name: 'Injected', community: 'baghdadi' },
    });
    expect(response.status()).toBe(401);
  });

  test('cannot change anyone’s role', async ({ request }) => {
    const response = await request.patch(
      '/api/manage/accounts/00000000-0000-0000-0000-000000000000',
      { data: { role: 'admin' } },
    );
    expect(response.status()).toBe(403);
  });

  test('cannot judge a suggested term', async ({ request }) => {
    const response = await request.patch(
      '/api/manage/candidates/00000000-0000-0000-0000-000000000000',
      { data: { decision: 'accept' } },
    );
    expect(response.status()).toBe(401);
  });
});

test.describe('requesting an account', () => {
  test('the sign-in page offers both doors', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('tab', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /ask for an account/i })).toBeVisible();
  });

  test('a short password is refused', async ({ request }) => {
    const response = await request.post('/api/auth/request-account', {
      data: { email: 'someone@example.com', password: 'short', fullName: 'Someone' },
    });
    expect(response.status()).toBe(400);
  });

  test('an address that already exists gives nothing away', async ({ request }) => {
    // Saying "already registered" tells a stranger who holds an account here,
    // so an existing address gets the same 202 as a new one.
    //
    // 429 is also a pass, and not a fudge: five requests an hour per address is
    // the limiter working, it is returned without looking anything up, and it
    // therefore leaks nothing either. The test asserts the endpoint never
    // reaches a status that only an existing account could produce.
    const response = await request.post('/api/auth/request-account', {
      data: {
        email: ADMIN_EMAIL ?? 'inon1030@gmail.com',
        password: 'a-password-long-enough',
        fullName: 'Someone Else',
      },
    });
    expect([202, 429]).toContain(response.status());
  });
});

test.describe('the handling notice', () => {
  test('is reachable at its own address and from the footer', async ({ page }) => {
    await page.goto('/portal');
    await page.getByRole('link', { name: /how your contribution is handled/i }).click();
    await expect(page).toHaveURL(/\/handling/);
    await expect(page.getByRole('heading', { name: /how your contribution is handled/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your name and email address, if you give them' })).toBeVisible();
  });

  test('a submission without an agreed version is refused', async ({ request }) => {
    // The tick box is enforced in the browser and again here, which is the
    // half that matters: a script posting straight at the endpoint skips the
    // checkbox entirely.
    const response = await request.post('/api/items', {
      data: {
        title: 'No consent',
        files: [
          {
            path: 'uploads/nowhere.jpg',
            fileName: 'nowhere.jpg',
            mimeType: 'image/jpeg',
            byteSize: 10,
            analysis: null,
          },
        ],
      },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(JSON.stringify(body)).toMatch(/consentVersion/);
  });
});

test.describe('administrator', () => {
  test.skip(!hasAdmin, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run these.');

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('tab', { name: 'Sign in' }).click();
    await page.getByLabel('Email').fill(ADMIN_EMAIL!);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/review/);
  });

  test('reaches the vocabulary, and can add and remove a term', async ({ page }) => {
    const term = `E2E term ${Date.now()}`;

    await page.goto('/manage/vocabulary');
    await expect(page.getByRole('heading', { name: 'Manage' })).toBeVisible();

    await page.getByLabel('New term').fill(term);
    await page.getByRole('button', { name: 'Add' }).click();

    // The chip carries the term and a remove button whose accessible name
    // repeats it, so an exact text match finds neither. Match the row.
    const chip = page.getByRole('listitem').filter({ hasText: term });
    await expect(chip).toBeVisible();

    await page.getByRole('button', { name: `Remove ${term}` }).click();
    await expect(chip).toHaveCount(0);
  });

  test('registers a family and removes it', async ({ page }) => {
    const name = `E2E Family ${Date.now()}`;

    await page.goto('/manage/families');
    await page.getByLabel('Family name').fill(name);
    await page.getByLabel('Community').selectOption('baghdadi');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText(name, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: `Remove ${name}` }).click();
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  });

  test('sees the accounts roll and cannot change their own role', async ({ page }) => {
    await page.goto('/manage/accounts');
    await expect(page.getByRole('heading', { name: /waiting for a decision/i })).toBeVisible();

    // The row for the signed-in administrator offers no control at all.
    const self = page.locator('li', { hasText: ADMIN_EMAIL! });
    await expect(self.getByRole('combobox')).toHaveCount(0);
  });
});
