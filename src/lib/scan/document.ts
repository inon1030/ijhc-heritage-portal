/**
 * Finding a page in a photograph, straightening it, and making it read like a
 * scan (21.09.2026).
 *
 * Inon asked for scanning that is "smart" and free: the phone's camera, the
 * page found and cropped automatically, the result cleaned up the way a scanner
 * app does it, and each page added to the upload as if it had come from the
 * computer. This is that, in OpenCV.js (Apache-2.0) running in the browser -
 * no service, no key, no cost, and the photograph never leaves the phone until
 * the contributor presses Next.
 *
 * Pure functions over an OpenCV instance passed in, so the same code runs in
 * the scanner and in the unit tests (which load OpenCV under Node).
 *
 * ── the pipeline ──────────────────────────────────────────────────────────
 *
 *  findPage  - grey, blur, Canny edges, close the gaps, take the largest
 *              contour that simplifies to four corners and covers enough of
 *              the frame. Run on a small copy, so it is fast enough to draw
 *              the outline live over the camera.
 *  flatten   - perspective-warp those four corners to a rectangle the size of
 *              the page, capped at 2400px on the long edge.
 *  finish    - the look: `document` evens out the lighting (divides by a
 *              blurred copy of itself, which is what turns a yellow, shadowed
 *              page white); `bw` is an adaptive threshold for text; `photo`
 *              leaves colour alone apart from a gentle contrast lift, for
 *              photographs and objects.
 */

// OpenCV.js ships without useful types; the surface used here is small.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CV = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Mat = any;

export interface Point {
  x: number;
  y: number;
}

/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

export type Finish = 'document' | 'bw' | 'photo';

const DETECT_EDGE = 480;
const MAX_EDGE = 2400;

/** Orders four arbitrary corners clockwise from the top-left. */
export function orderCorners(points: Point[]): Quad {
  const bySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...points].sort((a, b) => a.y - a.x - (b.y - b.x));
  return [bySum[0], byDiff[0], bySum[3], byDiff[3]];
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function area(q: Point[]): number {
  let s = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    const b = q[(i + 1) % q.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/**
 * The page's four corners in `src`'s own pixels, or null when nothing
 * page-shaped fills at least a fifth of the frame.
 */
export function findPage(cv: CV, src: Mat): Quad | null {
  const scale = Math.min(1, DETECT_EDGE / Math.max(src.cols, src.rows));
  const small = new cv.Mat();
  const grey = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  try {
    cv.resize(src, small, new cv.Size(0, 0), scale, scale, cv.INTER_AREA);
    cv.cvtColor(small, grey, small.channels() === 4 ? cv.COLOR_RGBA2GRAY : cv.COLOR_RGB2GRAY);
    cv.GaussianBlur(grey, grey, new cv.Size(5, 5), 0);
    cv.Canny(grey, edges, 40, 120);
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const frame = small.cols * small.rows;
    let best: Point[] | null = null;
    let bestArea = frame * 0.2;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const hull = new cv.Mat();
      const approx = new cv.Mat();
      cv.convexHull(c, hull);
      cv.approxPolyDP(hull, approx, 0.02 * cv.arcLength(hull, true), true);
      if (approx.rows === 4) {
        const pts: Point[] = [];
        for (let k = 0; k < 4; k++) pts.push({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] });
        const a = area(pts);
        if (a > bestArea) {
          bestArea = a;
          best = pts;
        }
      }
      c.delete();
      hull.delete();
      approx.delete();
    }
    if (!best) return null;
    return orderCorners(best.map((p) => ({ x: p.x / scale, y: p.y / scale })));
  } finally {
    small.delete();
    grey.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
    kernel.delete();
  }
}

/** The whole frame as a quad, for when no page was found. */
export function wholeFrame(width: number, height: number): Quad {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

/** The page cut out along `quad` and squared up. The caller deletes the result. */
export function flatten(cv: CV, src: Mat, quad: Quad): Mat {
  const [tl, tr, br, bl] = quad;
  let w = Math.max(dist(tl, tr), dist(bl, br));
  let h = Math.max(dist(tl, bl), dist(tr, br));
  const cap = Math.min(1, MAX_EDGE / Math.max(w, h));
  w = Math.max(1, Math.round(w * cap));
  h = Math.max(1, Math.round(h * cap));
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, quad.flatMap((p) => [p.x, p.y]));
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
  const m = cv.getPerspectiveTransform(from, to);
  const out = new cv.Mat();
  cv.warpPerspective(src, out, m, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
  from.delete();
  to.delete();
  m.delete();
  return out;
}

/** The scan look, in place of `page` (RGBA). Returns a new Mat; the caller deletes both. */
export function finish(cv: CV, page: Mat, mode: Finish): Mat {
  const out = new cv.Mat();
  if (mode === 'photo') {
    // A gentle lift, nothing more: photographs and objects keep their colour.
    page.convertTo(out, -1, 1.08, 4);
    return out;
  }
  const rgb = new cv.Mat();
  cv.cvtColor(page, rgb, cv.COLOR_RGBA2RGB);
  if (mode === 'bw') {
    const grey = new cv.Mat();
    cv.cvtColor(rgb, grey, cv.COLOR_RGB2GRAY);
    cv.adaptiveThreshold(grey, grey, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 12);
    cv.cvtColor(grey, out, cv.COLOR_GRAY2RGBA);
    grey.delete();
    rgb.delete();
    return out;
  }
  // `document`: divide each channel by its own heavily blurred self. Uneven
  // light and the paper's tint are low-frequency; ink is not. What is left is
  // the ink on white, in its own colour.
  const channels = new cv.MatVector();
  cv.split(rgb, channels);
  const done = new cv.MatVector();
  const k = Math.max(31, Math.round(Math.max(page.cols, page.rows) / 25) | 1);
  for (let i = 0; i < 3; i++) {
    const ch = channels.get(i);
    const bg = new cv.Mat();
    cv.GaussianBlur(ch, bg, new cv.Size(k, k), 0);
    const f = new cv.Mat();
    cv.divide(ch, bg, f, 255);
    done.push_back(f);
    ch.delete();
    bg.delete();
    f.delete();
  }
  const merged = new cv.Mat();
  cv.merge(done, merged);
  cv.cvtColor(merged, out, cv.COLOR_RGB2RGBA);
  merged.delete();
  channels.delete();
  done.delete();
  rgb.delete();
  return out;
}
