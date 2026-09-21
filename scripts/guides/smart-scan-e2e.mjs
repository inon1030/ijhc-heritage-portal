/**
 * The smart scanner end to end, with a fake camera, against the running site.
 *
 *   node scripts/guides/smart-scan-e2e.mjs <feed.y4m> [out-dir]
 *
 * Chrome is given a video file as its camera: a page lying crooked on a table.
 * On a phone-sized, touch screen the test opens the scanner, waits for the page
 * to be outlined, shoots, keeps the page, and finishes. It then checks that the
 * page joined the upload as "Document 1 · 1 page" and that the kept image has
 * the page's proportions - that is, it was cropped and straightened, not the
 * whole landscape frame. Screenshots go to out-dir.
 * Nothing is sent: the upload itself is never pressed.
 */
import { chromium } from 'playwright';

const [feed, out = '.', lang = 'en'] = process.argv.slice(2);
const L = {
  en: { open: 'Smart scan with the camera', shoot: 'Scan the page', preview: 'The scanned page', corners: 'Adjust corners', doc: 'Document', keep: 'Keep this page', done: 'Done', document1: 'Document 1', page1: 'Page 1' },
  he: { open: 'סריקה חכמה במצלמה', shoot: 'סריקת העמוד', preview: 'העמוד הסרוק', corners: 'התאמת פינות', doc: 'מסמך', keep: 'שמירת העמוד', done: 'סיום', document1: 'מסמך 1', page1: 'עמוד 1' },
}[lang];
const BASE = process.env.GUIDES_BASE ?? 'http://localhost:3000';
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${feed}`],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, permissions: ['camera'] });
await ctx.addCookies([{ name: 'ijhc.lang', value: lang, url: BASE }, { name: 'ijhc.stats', value: 'declined', url: BASE }]);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(BASE + '/upload', { waitUntil: 'networkidle' });
// The development server's own badge is not part of the site.
await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });

await page.getByRole('button', { name: L.open }).click();
await page.getByRole('button', { name: L.shoot }).waitFor();
await page.waitForFunction(() => {
  const v = document.querySelector('[role=dialog] video');
  return v && v.videoWidth > 0;
}, null, { timeout: 60000 });
// OpenCV loads in the scanner's worker; the outline appears once it is ready.
await page.waitForTimeout(6000);
await page.screenshot({ path: `${out}/scan-${lang}-1-camera.png` });

await page.getByRole('button', { name: L.shoot }).click();
await page.getByRole('img', { name: L.preview }).waitFor({ timeout: 20000 });
await page.screenshot({ path: `${out}/scan-${lang}-2-review.png` });
await page.getByRole('button', { name: L.corners }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/scan-${lang}-3-corners.png` });
await page.getByRole('button', { name: L.doc, exact: true }).click();
await page.getByRole('img', { name: L.preview }).waitFor();
await page.getByRole('button', { name: L.keep }).click();
await page.getByRole('button', { name: L.done }).click();
await page.getByText(L.document1).waitFor();
await page.screenshot({ path: `${out}/scan-${lang}-4-upload.png`, fullPage: true });

const size = await page.evaluate((alt) => {
  const img = document.querySelector(`img[alt="${alt}"]`);
  return img ? { w: img.naturalWidth, h: img.naturalHeight } : null;
}, L.page1);
await browser.close();
const ratio = size ? size.w / size.h : 0;
console.log('kept page', JSON.stringify(size), 'ratio', ratio.toFixed(3));
// The test page lies in a quad whose longest sides are 682 x 721 pixels, so a
// correctly straightened page comes out close to 0.95 - not 1.33, which is the
// whole landscape frame, and not the page at an angle.
const ok = size && ratio > 0.9 && ratio < 0.99;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
