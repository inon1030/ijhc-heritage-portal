'use client';

import { useState, useSyncExternalStore } from 'react';
import { FilePlus2, Plus, ScanLine, X } from 'lucide-react';
import { useMessages } from '@/lib/i18n/provider';
import type { PickedFile } from '@/components/file-picker';
import { SmartScanner } from '@/components/smart-scanner';

/**
 * Smart scanning on the phone, as a way to contribute (21.09.2026).
 *
 * The Center had a video explaining how to scan a page with Google Drive and
 * then upload the PDF. Inon asked for the scanning to happen here, on the
 * phone, and to be smart - the page found, cropped, straightened and cleaned -
 * and free. The scanner itself is `smart-scanner.tsx` (OpenCV in the browser);
 * this is what the upload screen shows around it.
 *
 * Each scanning session is one document. After it, the person can add pages to
 * that document or scan a separate one; every scanned document becomes one
 * record (lib/upload/groups.ts), its pages in the order taken. The pages join
 * the same list as chosen files, so everything after this screen treats them
 * exactly as if they had been uploaded from a computer.
 *
 * Phones only. On a computer there is no camera worth scanning with, and an
 * earlier version's QR code "to open this on your phone" was not what was
 * wanted, so a computer simply does not see this.
 */

const COARSE = '(pointer: coarse)';
const subscribe = (change: () => void) => {
  const query = window.matchMedia(COARSE);
  query.addEventListener('change', change);
  return () => query.removeEventListener('change', change);
};

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
  // False on the server and on a computer: the button appears only where a
  // finger, and so almost certainly a camera, is doing the pointing.
  const onPhone = useSyncExternalStore(subscribe, () => window.matchMedia(COARSE).matches, () => false);
  const [scanning, setScanning] = useState<string | null>(null);

  const scanned = files.filter((f) => f.doc);
  const docs = [...new Set(scanned.map((f) => f.doc!))];
  // Once something has been scanned it stays on screen whatever the device
  // reports: a page someone kept must never become invisible.
  if (!onPhone && docs.length === 0) return null;

  function addPage(doc: string, raw: File) {
    const d = (docs.includes(doc) ? docs.indexOf(doc) : docs.length) + 1;
    const n = scanned.filter((f) => f.doc === doc).length + 1;
    const file = new File([raw], `scan-${d}-page-${n}.jpg`, { type: raw.type });
    // A render happens between pages, and the scanner calls the `onPage` of the
    // latest one, so `files` here always includes the pages kept before.
    onChange([...files, { id: `scan-${crypto.randomUUID()}`, file, doc, previewUrl: URL.createObjectURL(file) }]);
  }

  function remove(id: string) {
    const going = files.find((f) => f.id === id);
    if (going?.previewUrl) URL.revokeObjectURL(going.previewUrl);
    onChange(files.filter((f) => f.id !== id));
  }

  const newDoc = () => setScanning(`doc-${crypto.randomUUID()}`);

  return (
    <div className="rounded-[var(--radius-card)] bg-surface p-4">
      {scanning && (
        <SmartScanner
          pageCount={scanned.filter((f) => f.doc === scanning).length}
          onPage={(file) => addPage(scanning, file)}
          onClose={() => setScanning(null)}
        />
      )}

      {docs.length === 0 ? (
        <div>
          <button
            type="button"
            onClick={newDoc}
            disabled={disabled}
            className="inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-primary px-6 text-base font-medium text-white transition-colors hover:bg-primary-strong disabled:opacity-50"
          >
            <ScanLine size={22} aria-hidden />
            {t('upload.scan.button')}
          </button>
          <p className="mt-2.5 text-sm leading-relaxed text-muted">{t('upload.scan.hint')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {docs.map((doc, d) => {
            const pages = scanned.filter((f) => f.doc === doc);
            return (
              <section key={doc} className="rounded-2xl bg-paper p-3">
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
                      onClick={() => setScanning(doc)}
                      disabled={disabled}
                      className="flex h-28 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-rule-strong text-center text-[11px] leading-tight text-muted hover:border-primary hover:text-primary disabled:opacity-50"
                    >
                      <Plus size={20} aria-hidden />
                      {t('upload.scan.addPageShort')}
                    </button>
                  </li>
                </ol>
                <button
                  type="button"
                  onClick={() => setScanning(doc)}
                  disabled={disabled}
                  className="mt-3 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 font-medium text-white transition-colors hover:bg-primary-strong disabled:opacity-50"
                >
                  <ScanLine size={18} aria-hidden />
                  {t('upload.scan.addPage')}
                </button>
              </section>
            );
          })}
          <button
            type="button"
            onClick={newDoc}
            disabled={disabled}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-rule-strong bg-paper px-5 font-medium transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            <FilePlus2 size={18} aria-hidden />
            {t('upload.scan.newDocument')}
          </button>
        </div>
      )}
    </div>
  );
}
