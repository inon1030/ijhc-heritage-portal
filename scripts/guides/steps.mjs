/**
 * What each walkthrough step shows, and what it rings.
 *
 * `go` drives the page into the state the step describes. `spots` returns the
 * controls to ring, found the way a person would find them - by role and label
 * in the language being captured - so a renamed button breaks the capture
 * loudly instead of ringing the wrong thing.
 *
 * The words for each step are not here; they are in
 * `src/lib/guides/step-text.ts`, keyed by the same `id`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The interface strings, so a locator can say "the button called Next" in
// either language. English is read out of messages.ts; Hebrew is the JSON.
const en = Object.fromEntries(
  [...fs.readFileSync(path.join(ROOT, 'src/lib/i18n/messages.ts'), 'utf8').matchAll(/^\s*'([\w.]+)':\s*\n?\s*(['"])((?:\\.|(?!\2).)*)\2/gm)].map(
    (m) => [m[1], m[3].replace(/\\(['"])/g, '$1')],
  ),
);
const he = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/lib/i18n/locales/he.json'), 'utf8'));
export const T = (lang, key) => (lang === 'he' ? he[key] ?? en[key] : en[key]);

// ── the example: the Gubbay note, as the archive actually read it ───────────
const ANALYSIS = {
  provider: 'gemini',
  model: 'gemini-3.6-flash',
  summary:
    'A British India five-rupee note dated 6 January 1920, issued by the Government of India. It carries the signature of M. M. S. Gubbay, a Baghdadi Jewish civil servant who served as Finance Secretary to the Government of India.',
  keywords: ['banknote', 'currency', 'British India', 'Baghdadi Jews'],
  newTerms: [],
  language: 'English',
  confidence: 0.8,
  ocrText:
    'GOVERNMENT OF INDIA  CC 78  No 379247\nPromise to pay the Bearer on demand at any Office of Issue the sum of Rupees 5\nFIVE\n6 JANUARY 1920\nFOR THE GOVERNMENT OF INDIA  MMS Gubbay',
  transcript: null,
  suggestedCategory: 'documents',
  suggestedCommunity: 'baghdadi',
  offTopic: false,
  offTopicReason: null,
  suggestedPeriod: '1920s',
  suggestedOrigin: null,
  reasoning: null,
  evidence: {
    period: { basis: 'read', note: 'printed date 6 JANUARY 1920' },
    community: { basis: 'inferred', note: 'signed by M. M. S. Gubbay, a Baghdadi Jewish official in British India' },
    maker: { basis: 'read', note: 'heading reads GOVERNMENT OF INDIA' },
    material: { basis: 'inferred', note: 'printed on banknote paper' },
  },
  fields: [
    { key: 'category', value: 'documents', confidence: 0.85, basis: 'inferred', note: 'paper currency' },
    { key: 'community', value: 'baghdadi', confidence: 0.8, basis: 'inferred', note: 'signed by M. M. S. Gubbay' },
    { key: 'period', value: '1920s', confidence: 0.95, basis: 'read', note: 'printed date 6 JANUARY 1920' },
    { key: 'date_on_item', value: '6 JANUARY 1920', confidence: 0.95, basis: 'read', note: 'printed on the note' },
    { key: 'maker', value: 'Government of India', confidence: 0.9, basis: 'read', note: 'heading reads GOVERNMENT OF INDIA' },
    { key: 'material', value: 'paper', confidence: 0.75, basis: 'inferred', note: 'printed on banknote paper' },
  ],
  raw: null,
};

const SUMMARY_HE =
  'שטר של חמש רופי מהודו הבריטית, מיום 6 בינואר 1920, שהנפיקה ממשלת הודו. על השטר חתום מ. מ. ס. גובאי, פקיד ממשל יהודי בגדדי שכיהן כמזכיר האוצר של ממשלת הודו.';

async function fakeTheNetwork(page, lang) {
  if (page.__faked) return;
  page.__faked = true;
  const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/uploads/sign', (route) =>
    route.fulfill(json({ ok: true, data: { path: 'guides/example/gubbay-5-rupees.jpg', token: 'guide', grant: 'guide', expiresAt: Date.now() + 3600e3 } })),
  );
  await page.route('**/storage/v1/object/upload/sign/**', (route) => route.fulfill(json({ Key: 'heritage/guides/example/gubbay-5-rupees.jpg' })));
  await page.route('**/api/analyze', (route) =>
    route.fulfill(
      json({
        ok: true,
        data: {
          analysis: lang === 'he' ? { ...ANALYSIS, summary: SUMMARY_HE, language: 'Hebrew' } : ANALYSIS,
          simulated: false,
          previewPath: null,
          previewUrl: null,
          metadata: { mimeType: 'image/jpeg', byteSize: 100105, width: 640, height: 371 },
        },
      }),
    ),
  );
  await page.route('**/api/items', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill(json({ ok: true, data: { id: '00000000-0000-4000-8000-000000000000', receipt: 'guide-example-receipt' } }))
      : route.continue(),
  );
}

const goto = async ({ page, base }, where) => {
  await page.goto(base + where, { waitUntil: 'networkidle' });
};

// ── contributor ──────────────────────────────────────────────────────────────
const contributor = [
  {
    id: 'menu',
    go: (c) => goto(c, '/'),
    spots: [(p, l) => p.locator('header nav').getByRole('link', { name: T(l, 'nav.contribute') })],
  },
  {
    id: 'add-files',
    go: async (c) => {
      await fakeTheNetwork(c.page, c.lang);
      await goto(c, '/upload');
    },
    spots: [(p) => p.locator('input[type=file]').first().locator('xpath=..')],
  },
  {
    id: 'add-link',
    go: async () => {},
    spots: [(p) => p.locator('input[type=url]').locator('xpath=..'), (p, l) => p.getByRole('button', { name: T(l, 'upload.action.readPage') })],
  },
  {
    id: 'next',
    go: async ({ page, fixture }) => {
      await page.locator('input[type=file]').first().setInputFiles(fixture);
      await page.waitForTimeout(600);
    },
    spots: [(p, l) => p.getByRole('button', { name: T(l, 'flow.next'), exact: true })],
  },
  {
    id: 'email',
    go: async ({ page, lang }) => {
      await page.getByRole('button', { name: T(lang, 'flow.next'), exact: true }).click();
      await page.waitForTimeout(500);
    },
    spots: [(p) => p.locator('input[type=email]')],
  },
  {
    id: 'what-you-know',
    go: async ({ page, lang }) => {
      await page.locator('input[type=email]').fill('family@example.com');
      await page.locator('textarea').first().fill(
        lang === 'he'
          ? 'שטר של חמש רופי מאוסף המשפחה. החתימה היא של מ. מ. ס. גובאי, שכיהן כמזכיר האוצר של ממשלת הודו.'
          : 'A five-rupee note from our family collection. The signature is M. M. S. Gubbay, who was Finance Secretary to the Government of India.',
      );
    },
    spots: [(p) => p.locator('textarea').first()],
  },
  {
    id: 'consent',
    go: async ({ page }) => {
      const box = page.locator('input[type=checkbox]').last();
      await box.scrollIntoViewIfNeeded();
      await box.check();
    },
    spots: [(p) => p.locator('input[type=checkbox]').last().locator('xpath=..')],
  },
  {
    id: 'read-with-ai',
    go: async ({ page, lang }) => {
      await page.getByRole('button', { name: T(lang, 'flow.analyse') }).scrollIntoViewIfNeeded();
    },
    spots: [(p, l) => p.getByRole('button', { name: T(l, 'flow.analyse') })],
  },
  {
    id: 'description',
    go: async ({ page, lang }) => {
      await page.getByRole('button', { name: T(lang, 'flow.analyse') }).click();
      await page.getByRole('button', { name: T(lang, 'prereview.submit') }).waitFor({ timeout: 15000 });
      await page.locator('textarea').first().scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -120));
    },
    spots: [(p) => p.locator('textarea').first()],
  },
  {
    id: 'tags',
    go: async ({ page, lang }) => {
      await page.getByText(T(lang, 'prereview.yourTags'), { exact: false }).first().scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -80));
    },
    spots: [(p, l) => p.getByText(T(l, 'prereview.yourTags'), { exact: true }).first().locator('xpath=..')],
  },
  {
    id: 'fields',
    go: async ({ page, lang }) => {
      await page.getByText(T(lang, 'fields.heading'), { exact: true }).first().scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -60));
    },
    spots: [(p, l) => p.getByText(T(l, 'fields.heading'), { exact: true }).first().locator('xpath=../..')],
  },
  {
    id: 'add-field',
    go: async ({ page, lang }) => {
      await page.getByText(T(lang, 'fields.add'), { exact: true }).first().scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, 160));
    },
    spots: [(p, l) => p.getByText(T(l, 'fields.add'), { exact: true }).first().locator('xpath=..')],
  },
  {
    id: 'submit',
    go: async ({ page, lang }) => {
      await page.getByRole('button', { name: T(lang, 'prereview.submit') }).scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -260));
    },
    spots: [(p, l) => p.getByRole('button', { name: T(l, 'prereview.submit') })],
  },
  {
    id: 'receipt',
    go: async ({ page, lang }) => {
      await page.getByRole('button', { name: T(lang, 'prereview.submit') }).click();
      await page.getByText(T(lang, 'upload.done.one')).waitFor({ timeout: 15000 });
      await page.evaluate(() => window.scrollTo(0, 0));
    },
    spots: [(p) => p.locator('a[href*="/receipt/"]').first()],
  },
];

// ── knowledge expert and administrator: a real session, and nothing written ──
//
// These screens show the live queue, so the capture must not be able to change
// it. Every request that is not a GET is refused before it leaves the browser:
// a stray click on Publish or Delete would fail rather than act.
async function readOnly(page) {
  if (page.__readOnly) return;
  page.__readOnly = true;
  await page.route('**/*', (route) => (route.request().method() === 'GET' ? route.continue() : route.abort()));
}

const openFirstRecord = async (c) => {
  await readOnly(c.page);
  await goto(c, '/review');
  const href = await c.page.locator('main a[href^="/review/"]').first().getAttribute('href');
  await goto(c, href);
};
const scrollTo = (text) => async ({ page, lang }) => {
  await page.locator('main').getByText(T(lang, text), { exact: true }).first().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -90));
};
const around = (text, up = 1) => (p, l) => p.locator('main').getByText(T(l, text), { exact: true }).first().locator('xpath=' + Array(up).fill('..').join('/'));

const expert = [
  {
    id: 'menu-review',
    go: async (c) => {
      await readOnly(c.page);
      await goto(c, '/');
    },
    spots: [(p) => p.locator('header nav a[href="/review"]').first()],
  },
  {
    id: 'queue',
    go: async (c) => goto(c, '/review'),
    spots: [(p) => p.locator('main a[href^="/review/"]').first()],
  },
  { id: 'original', go: openFirstRecord, spots: [around('wb.original', 2)] },
  { id: 'record', go: scrollTo('wb.description'), spots: [around('wb.description', 2)] },
  { id: 'fields', go: scrollTo('wb.keywords'), spots: [around('wb.keywords', 2)] },
  { id: 'translations', go: scrollTo('review.languagesHeading'), spots: [around('review.languagesHeading', 2)] },
  {
    id: 'decide',
    go: async ({ page, lang }) => {
      await page.getByRole('button', { name: T(lang, 'wb.publish') }).first().scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, 140));
    },
    spots: [(p, l) => p.getByRole('button', { name: T(l, 'wb.publish') }).first(), (p, l) => p.getByRole('button', { name: T(l, 'wb.reject') }).first()],
  },
  {
    id: 'keywords',
    go: async (c) => goto(c, '/manage/vocabulary'),
    spots: [(p) => p.locator('main nav a[href="/manage/vocabulary"], main a[href="/manage/vocabulary"]').first(), (p) => p.locator('main form, main input').first()],
  },
  {
    id: 'families',
    go: async (c) => goto(c, '/manage/families'),
    spots: [around('families.heading', 1)],
  },
];

const admin = [
  {
    id: 'accounts-menu',
    go: async (c) => {
      await readOnly(c.page);
      await goto(c, '/review');
    },
    spots: [(p) => p.locator('header nav a[href="/manage/accounts"]').first()],
  },
  {
    id: 'approve',
    go: async (c) => goto(c, '/manage/accounts'),
    spots: [(p) => p.locator('main ul, main table').first()],
  },
  {
    id: 'bin',
    go: async (c) => goto(c, '/manage/bin'),
    spots: [(p) => p.locator('main li').first()],
  },
];

export const STEPS = { contributor, expert, admin };
