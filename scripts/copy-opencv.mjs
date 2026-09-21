/**
 * Puts OpenCV.js where the browser can fetch it: public/vendor/opencv.js.
 *
 * The smart scanner (src/components/smart-scanner.tsx) needs OpenCV to find a
 * page's edges and straighten it. It is ten megabytes, so it is not bundled
 * into any page: the scanner loads it with a script tag the first time someone
 * opens it, and from then on the browser's cache serves it. Copied from the
 * installed package on every dev and build rather than committed, so the
 * version is whatever package.json pins.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(ROOT, 'node_modules', '@techstark', 'opencv-js', 'dist', 'opencv.js');
const to = path.join(ROOT, 'public', 'vendor', 'opencv.js');
fs.mkdirSync(path.dirname(to), { recursive: true });
fs.copyFileSync(from, to);
console.log('opencv.js ->', path.relative(ROOT, to), `(${(fs.statSync(to).size / 1048576).toFixed(1)} MB)`);
