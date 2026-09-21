'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ImagePlus, Loader2, RotateCw, ScanLine, X } from 'lucide-react';
import { useMessages } from '@/lib/i18n/provider';
import { wholeFrame, type Finish, type Quad } from '@/lib/scan/document';
import { ScanWorker } from '@/lib/scan/worker-client';

/**
 * The scanner: the phone's camera inside the page, the page found live, and
 * each shot cropped, straightened and cleaned before it joins the upload
 * (21.09.2026).
 *
 * One session is one document. The person shoots page after page; each is
 * shown for a moment to check and adjust (the corners can be dragged, the look
 * changed, the page turned), then kept. "Done" hands the pages back in order.
 * Separate documents are separate sessions, started from the upload screen.
 *
 * The image work - finding the page, straightening, cleaning - runs in a Web
 * Worker (lib/scan/worker-client.ts), because OpenCV cannot start under the
 * site's Content-Security-Policy and the policy is not loosened for it. The
 * page sends pixels and gets pixels back.
 *
 * If the browser will not give us the camera - permission refused, an old
 * phone, an in-app browser - the same button falls back to the phone's own
 * camera app through a file input, and the photograph still goes through the
 * same finding, straightening and cleaning. Photographs already in the gallery
 * can be brought in the same way.
 */

type Phase = 'loading' | 'camera' | 'review';

const DETECT_WIDTH = 480;

function toCanvas(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(source, 0, 0, width, height);
  return canvas;
}

const pixels = (canvas: HTMLCanvasElement) => canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);

async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height));
  return toCanvas(bitmap, Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
}

/** Finds the page on a small copy of `canvas`, in `canvas`'s own pixels. */
async function detectOn(worker: ScanWorker, canvas: HTMLCanvasElement | HTMLVideoElement, width: number, height: number) {
  const k = width / DETECT_WIDTH;
  const small = toCanvas(canvas, DETECT_WIDTH, Math.round(height / k));
  const found = await worker.detect(pixels(small));
  return found ? (found.map((p) => ({ x: p.x * k, y: p.y * k })) as Quad) : null;
}

export function SmartScanner({
  pageCount,
  onPage,
  onClose,
}: {
  /** Pages already kept in this document, for the counter. */
  pageCount: number;
  onPage: (file: File) => void;
  onClose: () => void;
}) {
  const t = useMessages();
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const fallback = useRef<HTMLInputElement>(null);
  const workerRef = useRef<ScanWorker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveQuad = useRef<Quad | null>(null);

  const [phase, setPhase] = useState<Phase>('loading');
  const [ready, setReady] = useState(false);
  const [noCamera, setNoCamera] = useState(false);
  const [shot, setShot] = useState<HTMLCanvasElement | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [look, setLook] = useState<Finish>('document');
  const [turns, setTurns] = useState(0);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<{ key: string; url: string } | null>(null);
  const [kept, setKept] = useState(pageCount);
  const [busy, setBusy] = useState(false);

  // The worker (OpenCV) and the camera, together; either may be slow on a phone.
  useEffect(() => {
    let cancelled = false;
    const worker = new ScanWorker();
    workerRef.current = worker;
    worker.ready().then(
      () => !cancelled && setReady(true),
      () => {},
    );
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        });
        if (cancelled) return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled) setNoCamera(true);
      }
      if (!cancelled) setPhase('camera');
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      worker.close();
    };
  }, []);

  // The live outline: a few times a second, on a small copy of the frame.
  useEffect(() => {
    if (phase !== 'camera' || noCamera || !ready) return;
    let timer = 0;
    let stopped = false;
    const tick = async () => {
      const v = video.current;
      const o = overlay.current;
      const worker = workerRef.current;
      if (v && o && worker && v.videoWidth) {
        try {
          liveQuad.current = await detectOn(worker, v, v.videoWidth, v.videoHeight);
        } catch {
          liveQuad.current = null;
        }
        if (!stopped) drawOutline(o, v, liveQuad.current);
      }
      if (!stopped) timer = window.setTimeout(tick, 200);
    };
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [phase, noCamera, ready]);

  const review = useCallback(async (canvas: HTMLCanvasElement, found: Quad | null) => {
    let q = found;
    const worker = workerRef.current;
    if (!q && worker) q = await detectOn(worker, canvas, canvas.width, canvas.height).catch(() => null);
    setShot(canvas);
    setQuad(q ?? wholeFrame(canvas.width, canvas.height));
    setLook(q ? 'document' : 'photo');
    setTurns(0);
    setEditing(false);
    setPhase('review');
  }, []);

  function shoot() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    void review(toCanvas(v, v.videoWidth, v.videoHeight), liveQuad.current);
  }

  async function fromFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await review(await fileToCanvas(file), null);
    } finally {
      setBusy(false);
    }
  }

  // The finished page, from the worker, as a canvas.
  const result = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    const worker = workerRef.current;
    if (!shot || !quad || !worker) return null;
    const image = await worker.render(pixels(shot), quad, look, turns);
    const out = document.createElement('canvas');
    out.width = image.width;
    out.height = image.height;
    out.getContext('2d')!.putImageData(image, 0, 0);
    return out;
  }, [shot, quad, look, turns]);

  // Redrawn whenever the corners, the look or the turn change. Keyed, so a
  // slow answer for an older setting never replaces a newer one.
  const wanted = phase === 'review' && !editing && ready ? `${look}|${turns}|${JSON.stringify(quad)}` : null;
  useEffect(() => {
    if (!wanted) return;
    let current = true;
    result().then(
      (canvas) => current && canvas && setPreview({ key: wanted, url: canvas.toDataURL('image/jpeg', 0.8) }),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [wanted, result]);
  const shown = preview && preview.key === wanted ? preview.url : null;

  async function keep() {
    setBusy(true);
    const canvas = await result().catch(() => null);
    const blob = canvas ? await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.9)) : null;
    setBusy(false);
    if (!blob) return;
    onPage(new File([blob], `scan-page-${kept + 1}.jpg`, { type: 'image/jpeg' }));
    setKept((n) => n + 1);
    setShot(null);
    setPhase('camera');
    if (noCamera) fallback.current?.click();
  }

  // Rendered on <body>, not where it is used: the upload screen animates in
  // with a transform, and a transformed ancestor turns `position: fixed` into
  // "fixed to that box" - the scanner opened inside the page instead of over it.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t('scan.title')} className="fixed inset-0 z-[80] flex flex-col bg-paper">
      <input ref={gallery} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => { void fromFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={fallback} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => { void fromFile(e.target.files?.[0]); e.target.value = ''; }} />

      <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
        <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full border border-rule-strong" aria-label={t('scan.close')}>
          <X size={20} aria-hidden />
        </button>
        <p className="text-base font-medium">
          {t('scan.title')}
          <span className="ms-2 font-mono text-sm text-muted">{t('scan.kept', { count: kept })}</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          disabled={kept === 0}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 font-medium text-white disabled:opacity-40"
        >
          <Check size={18} aria-hidden />
          {t('scan.done')}
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-surface-2">
        {phase === 'loading' && (
          <p className="flex items-center gap-2 text-muted" aria-live="polite">
            <Loader2 size={18} className="animate-spin" aria-hidden />
            {t('scan.loading')}
          </p>
        )}

        {/* The camera stays mounted under the review so it does not restart. */}
        <div className={phase === 'camera' && !noCamera ? 'relative h-full w-full' : 'hidden'}>
          <video ref={video} playsInline muted className="h-full w-full object-contain" />
          <canvas ref={overlay} className="pointer-events-none absolute inset-0 h-full w-full" />
        </div>

        {phase === 'camera' && noCamera && (
          <div className="max-w-sm px-6 text-center">
            <p className="text-muted">{t('scan.noCamera')}</p>
            <button type="button" onClick={() => fallback.current?.click()}
              className="mt-4 inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 font-medium text-white">
              <ScanLine size={20} aria-hidden />
              {t('scan.takePhoto')}
            </button>
          </div>
        )}

        {phase === 'review' && shot && quad && (
          editing ? (
            <CornerEditor shot={shot} quad={quad} onChange={setQuad} />
          ) : shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt={t('scan.preview')} className="max-h-full max-w-full object-contain p-3" />
          ) : (
            <Loader2 size={22} className="animate-spin text-muted" aria-hidden />
          )
        )}
      </div>

      <footer className="border-t border-rule px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {phase === 'review' ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {(['document', 'bw', 'photo'] as Finish[]).map((mode) => (
                <button key={mode} type="button" onClick={() => { setEditing(false); setLook(mode); }}
                  aria-pressed={look === mode}
                  className={['h-9 rounded-full px-4 text-sm font-medium', look === mode ? 'bg-primary text-white' : 'border border-rule-strong'].join(' ')}>
                  {t(mode === 'document' ? 'scan.look.document' : mode === 'bw' ? 'scan.look.bw' : 'scan.look.photo')}
                </button>
              ))}
              <button type="button" onClick={() => setEditing((v) => !v)} aria-pressed={editing}
                className={['h-9 rounded-full px-4 text-sm font-medium', editing ? 'bg-primary text-white' : 'border border-rule-strong'].join(' ')}>
                {t('scan.corners')}
              </button>
              <button type="button" onClick={() => setTurns((n) => n + 1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-rule-strong" aria-label={t('scan.rotate')}>
                <RotateCw size={16} aria-hidden />
              </button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => { setShot(null); setPhase('camera'); }} className="h-12 rounded-full border border-rule-strong px-5 font-medium">
                {t('scan.retake')}
              </button>
              <button type="button" onClick={() => void keep()} disabled={busy}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-6 text-base font-medium text-white disabled:opacity-50">
                <Check size={20} aria-hidden />
                {t('scan.keep')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => gallery.current?.click()} disabled={busy}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-rule-strong" aria-label={t('scan.fromGallery')}>
              <ImagePlus size={22} aria-hidden />
            </button>
            <button type="button" onClick={noCamera ? () => fallback.current?.click() : shoot} disabled={phase !== 'camera' || busy}
              aria-label={t('scan.shoot')}
              className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-primary ring-4 ring-primary/25 disabled:opacity-40">
              <span className="h-[58px] w-[58px] rounded-full border-[3px] border-white" />
            </button>
            <span className="w-16 text-center text-xs leading-tight text-muted">{t('scan.auto')}</span>
          </div>
        )}
      </footer>
    </div>,
    document.body,
  );
}

/** Draws the detected page over the live video, in the same letterboxed frame. */
function drawOutline(canvas: HTMLCanvasElement, video: HTMLVideoElement, quad: Quad | null) {
  const box = canvas.getBoundingClientRect();
  canvas.width = box.width * devicePixelRatio;
  canvas.height = box.height * devicePixelRatio;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!quad) return;
  const s = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
  const ox = (canvas.width - video.videoWidth * s) / 2;
  const oy = (canvas.height - video.videoHeight * s) / 2;
  ctx.beginPath();
  quad.forEach((p, i) => (i ? ctx.lineTo(ox + p.x * s, oy + p.y * s) : ctx.moveTo(ox + p.x * s, oy + p.y * s)));
  ctx.closePath();
  ctx.fillStyle = 'rgba(61, 114, 180, 0.18)';
  ctx.fill();
  ctx.lineWidth = 4 * devicePixelRatio;
  ctx.strokeStyle = '#3d72b4';
  ctx.stroke();
}

/** The photograph with four corners to drag, for when the page was not found right. */
function CornerEditor({ shot, quad, onChange }: { shot: HTMLCanvasElement; quad: Quad; onChange: (q: Quad) => void }) {
  const img = useRef<HTMLImageElement>(null);
  const [src] = useState(() => shot.toDataURL('image/jpeg', 0.85));
  const drag = useRef<number | null>(null);

  function move(e: React.PointerEvent) {
    const i = drag.current;
    const el = img.current;
    if (i === null || !el) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(0, ((e.clientX - r.left) / r.width) * shot.width), shot.width);
    const y = Math.min(Math.max(0, ((e.clientY - r.top) / r.height) * shot.height), shot.height);
    const next = [...quad] as Quad;
    next[i] = { x, y };
    onChange(next);
  }

  return (
    <div className="p-3" onPointerMove={move} onPointerUp={() => (drag.current = null)}>
      <div className="relative inline-block touch-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={img} src={src} alt="" className="block max-h-[62vh] max-w-full select-none" draggable={false} />
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${shot.width} ${shot.height}`} preserveAspectRatio="none">
          <polygon points={quad.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(61,114,180,0.18)" stroke="#3d72b4" strokeWidth={shot.width / 200} />
        </svg>
        {quad.map((p, i) => (
          <span
            key={i}
            aria-hidden
            onPointerDown={(e) => {
              drag.current = i;
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
            }}
            className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-primary shadow-lift"
            style={{ left: `${(p.x / shot.width) * 100}%`, top: `${(p.y / shot.height) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}
