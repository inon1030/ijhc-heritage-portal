'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Camera, FilePlus2, Plus, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useMessages } from '@/lib/i18n/provider';
import type { PickedFile } from '@/components/file-picker';

/**
 * Scanning with the phone, as a way to contribute (21.09.2026).
 *
 * The Center had a video explaining how to scan a page with Google Drive and
 * then upload the PDF. Inon asked for the scanning to happen here instead: the
 * phone's camera opens from the page, each photograph is a page, and after
 * every page the person says whether the next one belongs to the same document
 * or starts a separate one. Each scanned document becomes one record
 * (lib/upload/groups.ts); its pages are the record's files, in order.
 *
 * The camera is the browser's own - `<input capture="environment">` - so it
 * works on every phone without a permission prompt of ours and without a
 * library. A photograph straight off a phone is 4000 pixels and several
 * megabytes; it is scaled here to 2400 on its long edge before upload, which is
 * more than enough to read a handwritten page and a fifth of the transfer on a
 * mobile connection.
 *
 * On a computer there is usually no camera worth using, so the same button
 * sits beside a QR code that opens this page on the phone.
 */

const LONG_EDGE = 2400;

// A finger rather than a mouse: the device most likely to have a camera to hand.
const COARSE = '(pointer: coarse)';
const subscribe = (change: () => void) => {
  const query = window.matchMedia(COARSE);
  query.addEventListener('change', change);
  return () => query.removeEventListener('change', change);
};

async function asPage(file: File, name: string): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.9));
    return blob ? new File([blob], name, { type: 'image/jpeg' }) : file;
  } catch {
    // An image the browser cannot decode goes up as it is; the archive's own
    // validation decides whether it is acceptable.
    return file;
  }
}

export function PhoneScanner({
  files,
  onChange,
  disabled = false,
}: {
  /** Every picked file; this component shows and edits only the scanned ones. */
  files: PickedFile[];
  onChange: (files: PickedFile[]) => void;
  disabled?: boolean;
}) {
  const t = useMessages();
  const camera = useRef<HTMLInputElement>(null);
  const target = useRef<string | null>(null);
  const [working, setWorking] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const onPhone = useSyncExternalStore(subscribe, () => window.matchMedia(COARSE).matches, () => true);

  const scanned = files.filter((f) => f.doc);
  const docs = [...new Set(scanned.map((f) => f.doc!))];

  useEffect(() => {
    if (onPhone) return;
    // The archive's public address when one is configured, so a code shown on
    // a preview or a tunnel still sends the phone to the real site.
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || window.location.origin;
    QRCode.toString(`${origin}/upload`, { type: 'svg', margin: 1, width: 132 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [onPhone]);

  function open(doc: string) {
    target.current = doc;
    camera.current?.click();
  }

  async function onCaptured(list: FileList | null) {
    const doc = target.current;
    if (!list?.length || !doc) return;
    setWorking(true);
    const docIndex = (docs.includes(doc) ? docs.indexOf(doc) : docs.length) + 1;
    let page = scanned.filter((f) => f.doc === doc).length;
    const added: PickedFile[] = [];
    for (const raw of [...list]) {
      page += 1;
      const file = await asPage(raw, `scan-${docIndex}-page-${page}.jpg`);
      added.push({
        id: `scan-${crypto.randomUUID()}`,
        file,
        doc,
        previewUrl: URL.createObjectURL(file),
      });
    }
    setWorking(false);
    onChange([...files, ...added]);
  }

  function remove(id: string) {
    const going = files.find((f) => f.id === id);
    if (going?.previewUrl) URL.revokeObjectURL(going.previewUrl);
    onChange(files.filter((f) => f.id !== id));
  }

  const newDoc = () => open(`doc-${crypto.randomUUID()}`);

  return (
    <div className="rounded-[var(--radius-card)] bg-surface p-4 sm:p-5">
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onChange={(e) => {
          void onCaptured(e.target.files);
          e.target.value = '';
        }}
      />

      {docs.length === 0 ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <button
              type="button"
              onClick={newDoc}
              disabled={disabled || working}
              className="inline-flex h-12 items-center gap-2.5 rounded-full bg-primary px-6 text-base font-medium text-white transition-colors hover:bg-primary-strong disabled:opacity-50"
            >
              <Camera size={20} aria-hidden />
              {t('upload.scan.button')}
            </button>
            <p className="mt-2.5 text-sm leading-relaxed text-muted">{t('upload.scan.hint')}</p>
          </div>
          {!onPhone && qr && (
            <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:text-end">
              <span
                data-qr
                className="block h-[132px] w-[132px] overflow-hidden rounded-xl bg-white p-1"
                // A QR code drawn by the qrcode library from this page's own
                // address: an SVG string with no scripts and no outside input.
                dangerouslySetInnerHTML={{ __html: qr }}
              />
              <span className="max-w-[12rem] text-xs leading-snug text-muted">{t('upload.scan.onComputer')}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {docs.map((doc, d) => {
            const pages = scanned.filter((f) => f.doc === doc);
            return (
              <section key={doc} className="rounded-2xl bg-paper p-3 sm:p-4">
                <p className="text-base font-medium">
                  {t('upload.scan.document', { n: d + 1 })}
                  <span className="ms-2 text-sm font-normal text-muted">
                    ·{' '}
                    {pages.length === 1 ? t('upload.scan.onePage') : t('upload.scan.pages', { count: pages.length })}
                  </span>
                </p>
                <ol className="mt-3 flex flex-wrap gap-2.5">
                  {pages.map((p, i) => (
                    <li key={p.id} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.previewUrl ?? ''}
                        alt={t('upload.scan.pageAlt', { n: i + 1 })}
                        className="h-28 w-20 rounded-lg border border-rule object-cover"
                      />
                      <span className="absolute bottom-1 start-1 rounded-full bg-paper/90 px-1.5 font-mono text-[11px]">{i + 1}</span>
                      <button
                        type="button"
                        onClick={() => remove(p.id)}
                        disabled={disabled}
                        className="absolute -top-2 -end-2 flex h-7 w-7 items-center justify-center rounded-full border border-rule bg-paper text-muted shadow-soft hover:text-critical"
                      >
                        <X size={14} aria-hidden />
                        <span className="sr-only">{t('upload.scan.removePage', { n: i + 1 })}</span>
                      </button>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      onClick={() => open(doc)}
                      disabled={disabled || working}
                      className="flex h-28 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-rule-strong text-center text-[11px] leading-tight text-muted hover:border-primary hover:text-primary disabled:opacity-50"
                    >
                      <Plus size={20} aria-hidden />
                      {t('upload.scan.addPageShort')}
                    </button>
                  </li>
                </ol>
                <button
                  type="button"
                  onClick={() => open(doc)}
                  disabled={disabled || working}
                  className="mt-3 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 font-medium text-white transition-colors hover:bg-primary-strong disabled:opacity-50"
                >
                  <Camera size={18} aria-hidden />
                  {t('upload.scan.addPage')}
                </button>
              </section>
            );
          })}
          <button
            type="button"
            onClick={newDoc}
            disabled={disabled || working}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-rule-strong bg-paper px-5 font-medium transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            <FilePlus2 size={18} aria-hidden />
            {t('upload.scan.newDocument')}
          </button>
        </div>
      )}
      {working && <p className="mt-3 text-sm text-muted" aria-live="polite">{t('upload.scan.working')}</p>}
    </div>
  );
}
