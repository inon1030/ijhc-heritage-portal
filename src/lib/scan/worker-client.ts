import type { Finish, Quad } from '@/lib/scan/document';

/**
 * The page's side of the scanner worker (public/vendor/scan-worker.js).
 *
 * OpenCV runs in the worker because it needs `new Function` to start, which the
 * site's Content-Security-Policy forbids in every page; the worker file is
 * served without that policy (scripts/copy-opencv.mjs explains). The page only
 * ever sends pixels and gets pixels or four corners back.
 */
export class ScanWorker {
  private worker: Worker;
  private next = 0;
  private waiting = new Map<number, { resolve: (v: Reply) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker = new Worker('/vendor/scan-worker.js');
    this.worker.onmessage = (event: MessageEvent<Reply>) => {
      const pending = this.waiting.get(event.data.id);
      if (!pending) return;
      this.waiting.delete(event.data.id);
      if (event.data.ok) pending.resolve(event.data);
      else pending.reject(new Error(event.data.error ?? 'scan failed'));
    };
    this.worker.onerror = () => {
      for (const pending of this.waiting.values()) pending.reject(new Error('the scanner stopped'));
      this.waiting.clear();
    };
  }

  private send(message: Record<string, unknown>, transfer: Transferable[] = []): Promise<Reply> {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.worker.postMessage({ ...message, id }, transfer);
    });
  }

  /** Resolves once OpenCV has loaded in the worker. */
  ready(): Promise<void> {
    return this.send({ op: 'ping' }).then(() => undefined);
  }

  /** The page's corners in `image`'s pixels, or null. */
  async detect(image: ImageData): Promise<Quad | null> {
    return (await this.send({ op: 'detect', image }, [image.data.buffer])).quad ?? null;
  }

  /** The page cut out, squared up, given its look and turned. */
  async render(image: ImageData, quad: Quad, look: Finish, turns: number): Promise<ImageData> {
    const reply = await this.send({ op: 'render', image, quad, look, turns }, [image.data.buffer]);
    return reply.image!;
  }

  close() {
    this.worker.terminate();
  }
}

interface Reply {
  id: number;
  ok: boolean;
  error?: string;
  quad?: Quad | null;
  image?: ImageData;
}
