import type { CV } from '@/lib/scan/document';

/**
 * OpenCV.js, fetched once and only when a scanner opens.
 *
 * Ten megabytes is too much to put on any page by default, so it is not in the
 * bundle: `scripts/copy-opencv.mjs` puts the package's file in
 * `public/vendor/opencv.js`, and the first scanner to open adds a script tag
 * for it. The browser caches it; every later scan starts at once.
 */
let loading: Promise<CV> | null = null;

export function loadOpenCV(): Promise<CV> {
  if (loading) return loading;
  loading = new Promise<CV>((resolve, reject) => {
    const w = window as unknown as { cv?: CV & { then?: unknown } };
    const settle = () => {
      const cv = w.cv;
      if (!cv) return reject(new Error('OpenCV did not load'));
      // Newer builds expose a promise-like module; older ones call back.
      if (typeof cv.then === 'function') {
        (cv as unknown as Promise<CV>).then((ready) => {
          // The module object is itself "thenable": resolving a promise with
          // it would wait on it again, for ever. Take `then` off first.
          delete ready.then;
          w.cv = ready;
          resolve(ready);
        }, reject);
      } else if (cv.Mat) {
        resolve(cv);
      } else {
        cv.onRuntimeInitialized = () => resolve(cv);
      }
    };
    if (w.cv) return settle();
    const script = document.createElement('script');
    script.src = '/vendor/opencv.js';
    script.async = true;
    script.onload = settle;
    script.onerror = () => {
      loading = null;
      reject(new Error('OpenCV could not be fetched'));
    };
    document.head.appendChild(script);
  });
  return loading;
}
