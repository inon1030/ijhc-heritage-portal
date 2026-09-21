/**
 * Scanning end to end, against the running site, with nothing sent.
 *
 *   node scripts/guides/scan-e2e.mjs
 *
 * Two documents are scanned - two pages, then a separate one-page document -
 * and the submission is caught before it leaves: exactly two records must be
 * posted, the first with both pages in order. Also checks the old path: one
 * ordinary file still makes one record.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { T } from './steps.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures', 'gubbay-5-rupees.jpg');
const BASE = process.env.GUIDES_BASE ?? 'http://localhost:3000';
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function run(scenario) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', hasTouch: true });
  await ctx.addCookies([{ name: 'ijhc.lang', value: 'en', url: BASE }, { name: 'ijhc.stats', value: 'declined', url: BASE }]);
  const page = await ctx.newPage();
  const posted = [];
  let n = 0;
  await page.route('**/api/uploads/sign', (r) => r.fulfill(json({ ok: true, data: { path: `t/${++n}.jpg`, token: 'x', grant: 'g', expiresAt: Date.now() + 3e6 } })));
  await page.route('**/storage/v1/object/upload/sign/**', (r) => r.fulfill(json({ Key: 'k' })));
  await page.route('**/api/analyze', (r) => r.fulfill(json({ ok: true, data: { analysis: null, error: 'none', simulated: false, previewPath: null, previewUrl: null, metadata: { mimeType: 'image/jpeg', byteSize: 1000, width: 10, height: 10 } } })));
  await page.route('**/api/items', (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    posted.push(JSON.parse(r.request().postData()));
    return r.fulfill(json({ ok: true, data: { id: `id${posted.length}`, receipt: `rc${posted.length}` } }));
  });
  await page.goto(BASE + '/upload', { waitUntil: 'networkidle' });
  await scenario(page);
  await page.getByRole('button', { name: T('en', 'flow.next'), exact: true }).click();
  await page.locator('input[type=email]').fill('a@example.com');
  await page.locator('input[type=checkbox]').last().check();
  await page.getByRole('button', { name: T('en', 'flow.analyse') }).click();
  await page.getByRole('button', { name: /Submit/ }).first().waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: /Submit/ }).first().click();
  await page.waitForTimeout(1500);
  await browser.close();
  return posted;
}

async function scanInto(page, buttonName) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: buttonName }).first().click()]);
  await chooser.setFiles(FIX);
  await page.waitForTimeout(700);
}

const scanned = await run(async (page) => {
  await scanInto(page, T('en', 'upload.scan.button'));
  await scanInto(page, T('en', 'upload.scan.addPage'));
  await scanInto(page, T('en', 'upload.scan.newDocument'));
});
const shape = scanned.map((p) => p.files.map((f) => f.fileName));
console.log('scanned:', JSON.stringify(shape), scanned.map((p) => p.title));
const ok1 = shape.length === 2 && shape[0].join() === 'scan-1-page-1.jpg,scan-1-page-2.jpg' && shape[1].join() === 'scan-2-page-1.jpg';

const plain = await run(async (page) => {
  await page.locator('input[type=file]:not([capture])').first().setInputFiles(FIX);
  await page.waitForTimeout(500);
});
console.log('plain:', JSON.stringify(plain.map((p) => p.files.map((f) => f.fileName))));
const ok2 = plain.length === 1 && plain[0].files.length === 1;

console.log(ok1 && ok2 ? 'PASS' : 'FAIL');
process.exit(ok1 && ok2 ? 0 : 1);
