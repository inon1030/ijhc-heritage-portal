// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { finish, findPage, flatten, orderCorners, wholeFrame, type CV } from '@/lib/scan/document';

/**
 * The smart scanner's image work, on OpenCV under Node - the same functions
 * the browser runs. A synthetic photograph: a light page, turned and in
 * perspective, lying on a dark table.
 */

let cv: CV;

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@techstark/opencv-js');
  cv = await new Promise<CV>((done) => {
    if (typeof mod.then === 'function') {
      // Thenable itself: take `then` off before handing it to a promise, or
      // the promise waits on it for ever. The same as src/lib/scan/opencv.ts.
      mod.then((ready: CV) => {
        delete ready.then;
        done(ready);
      });
    } else if (mod.Mat) done(mod);
    else mod.onRuntimeInitialized = () => done(mod);
  });
}, 240_000);

// The page's true corners in the 800x600 "photograph".
const CORNERS = [
  { x: 180, y: 90 },
  { x: 610, y: 130 },
  { x: 640, y: 520 },
  { x: 150, y: 470 },
];

function photograph() {
  const img = new cv.Mat(600, 800, cv.CV_8UC4, new cv.Scalar(60, 45, 35, 255));
  const pts = cv.matFromArray(4, 1, cv.CV_32SC2, CORNERS.flatMap((p) => [p.x, p.y]));
  const polys = new cv.MatVector();
  polys.push_back(pts);
  cv.fillPoly(img, polys, new cv.Scalar(235, 228, 210, 255));
  // A line of "ink" on the page.
  cv.line(img, new cv.Point(260, 250), new cv.Point(520, 270), new cv.Scalar(30, 30, 30, 255), 6);
  pts.delete();
  polys.delete();
  return img;
}

describe('smart scanning', () => {
  it('orders corners clockwise from the top-left', () => {
    const q = orderCorners([CORNERS[2], CORNERS[0], CORNERS[3], CORNERS[1]]);
    expect(q).toEqual(CORNERS);
  });

  it('finds the page on the table, within a few pixels of each corner', () => {
    const img = photograph();
    const q = findPage(cv, img);
    img.delete();
    expect(q).not.toBeNull();
    q!.forEach((p, i) => {
      expect(Math.abs(p.x - CORNERS[i].x)).toBeLessThan(8);
      expect(Math.abs(p.y - CORNERS[i].y)).toBeLessThan(8);
    });
  });

  it('finds nothing in a frame with no page', () => {
    const blank = new cv.Mat(600, 800, cv.CV_8UC4, new cv.Scalar(90, 90, 90, 255));
    expect(findPage(cv, blank)).toBeNull();
    blank.delete();
  });

  it('squares the page up to its own size', () => {
    const img = photograph();
    const flat = flatten(cv, img, orderCorners(CORNERS));
    // The longer of each pair of opposite sides.
    expect(Math.abs(flat.cols - 491)).toBeLessThan(4);
    expect(Math.abs(flat.rows - 390)).toBeLessThan(4);
    // Inside the flattened page it is paper, not table.
    const centre = flat.ucharPtr(Math.round(flat.rows / 4), Math.round(flat.cols / 4));
    expect(centre[0]).toBeGreaterThan(200);
    flat.delete();
    img.delete();
  });

  it('makes all three looks, and the document look turns the paper white', () => {
    const img = photograph();
    const flat = flatten(cv, img, orderCorners(CORNERS));
    for (const mode of ['document', 'bw', 'photo'] as const) {
      const out = finish(cv, flat, mode);
      expect(out.cols).toBe(flat.cols);
      expect(out.rows).toBe(flat.rows);
      if (mode === 'document') {
        const px = out.ucharPtr(20, 20);
        expect(px[0]).toBeGreaterThan(240);
      }
      out.delete();
    }
    flat.delete();
    img.delete();
  });

  it('uses the whole frame when asked to', () => {
    expect(wholeFrame(800, 600)[2]).toEqual({ x: 800, y: 600 });
  });
});
