// Static component fixtures only: no server, remote requests, or credentials.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const folder = 'docs/phase3-public-qa';
const css = await postcss([tailwind()]).process(fs.readFileSync('src/app/globals.css', 'utf8'), {
  from: 'src/app/globals.css', to: `${folder}/fixture.css`,
});
fs.writeFileSync(`${folder}/fixture.css`, css.css);
const browser = await chromium.launchPersistentContext(path.resolve('.guide-tmp/phase3-browser'), {
  channel: 'chrome', headless: true,
  args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'],
});
await browser.setOffline(true);
try {
  const page = await browser.newPage();
  const results = [];
  for (const locale of ['he', 'en']) for (const width of [375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`file:///${path.resolve(`${folder}/feedback-${locale}.html`).replaceAll('\\', '/')}`);
    await page.locator('details').evaluate(el => { el.open = true; });
    await page.keyboard.press('Tab');
    const measurements = await page.evaluate(() => ({
      viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      focusOutline: getComputedStyle(document.activeElement).outlineStyle,
      controls: [...document.querySelectorAll('button,input:not([type=checkbox]):not([tabindex="-1"]),textarea,select,summary,label:has(input[type=checkbox])')]
        .filter(el => el.getClientRects().length)
        .map(el => ({ text: el.textContent?.trim().slice(0, 50) || el.getAttribute('name'),
          height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width })),
    }));
    results.push({ locale, ...measurements });
    await page.screenshot({ path: `${folder}/${locale}-${width}.png`, fullPage: true });
  }
  fs.writeFileSync(`${folder}/measurements.json`, JSON.stringify(results, null, 2));
  const failures = results.filter(row => row.scrollWidth > row.viewport || row.focusOutline === 'none' || row.controls.some(control => control.height < 44));
  console.log(JSON.stringify({ viewports: results.length, failures }));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
