/**
 * Client-side measurement of things only the browser can read cheaply.
 *
 * Image dimensions are re-derived from the file header on the server; duration
 * is taken here because the alternative is shipping ffmpeg to a serverless
 * function just to learn how long a recording is.
 */
export async function measureDuration(file: File): Promise<number | null> {
  if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) return null;

  return new Promise((resolve) => {
    const element = document.createElement(file.type.startsWith('audio/') ? 'audio' : 'video');
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };

    element.preload = 'metadata';
    element.onloadedmetadata = () =>
      done(Number.isFinite(element.duration) ? Math.round(element.duration * 1000) : null);
    element.onerror = () => done(null);
    element.src = url;

    setTimeout(() => done(null), 8000);
  });
}
