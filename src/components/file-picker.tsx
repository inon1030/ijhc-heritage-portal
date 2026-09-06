'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { FileUp, Image as ImageIcon, Music, X } from 'lucide-react';
import { Lightbox } from '@/components/lightbox';
import { MAX_FILE_BYTES, ALLOWED_MIME_TYPES, fileKind, validateFile } from '@/lib/files/validate';
import { useMessages } from '@/lib/i18n/provider';
import { cn, formatBytes } from '@/lib/utils';

/**
 * Choosing files, three ways: the picker, a drag onto the page, or a paste.
 *
 * Paste is the one that matters most in practice. Someone screenshotting a
 * photograph from a family WhatsApp thread has an image on the clipboard and no
 * file on disk, and until now the only way in was to save it first.
 *
 * Rejections are named per file rather than in one summary, because "some files
 * were not accepted" is useless when you dropped eleven.
 */

export interface PickedFile {
  id: string;
  file: File;
  /**
   * Object URL for images the browser can actually draw, so a thumbnail costs
   * no upload. Revoked on removal.
   *
   * Null for a TIFF. An object URL for one is not a broken link — it is a
   * perfectly valid URL that every browser except Safari renders as nothing,
   * which is worse: the contributor sees an empty grey square and cannot tell
   * whether their scan arrived. A viewable copy is made server-side when the
   * archive reads the file; until then the tile says so.
   */
  previewUrl: string | null;
}

let counter = 0;
const nextId = () => `f${(counter += 1)}`;

export function FilePicker({
  files,
  onChange,
  disabled = false,
}: {
  files: PickedFile[];
  onChange: (files: PickedFile[]) => void;
  disabled?: boolean;
}) {
  const t = useMessages();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejections, setRejections] = useState<string[]>([]);
  const [viewing, setViewing] = useState<number | null>(null);

  const add = useCallback(
    (incoming: File[]) => {
      if (disabled || !incoming.length) return;

      const accepted: PickedFile[] = [];
      const refused: string[] = [];

      for (const file of incoming) {
        const rejection = validateFile({ mimeType: file.type, byteSize: file.size });
        if (rejection) {
          refused.push(
            file.type
              ? `${file.name} — ${rejection.message}`
              : `${file.name} — your browser could not identify this file type. An iPhone HEIC photo often does this; convert it to JPEG.`,
          );
          continue;
        }
        accepted.push({
          id: nextId(),
          file,
          previewUrl: browserCanDraw(file.type) ? URL.createObjectURL(file) : null,
        });
      }

      setRejections(refused);
      if (accepted.length) onChange([...files, ...accepted]);
    },
    [disabled, files, onChange],
  );

  // A paste anywhere on the page, as long as the cursor is not in a text field —
  // where a paste plainly means the text.
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;

      const pasted = [...(event.clipboardData?.files ?? [])];
      if (!pasted.length) return;
      event.preventDefault();
      add(pasted);
    }

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [add]);

  useEffect(() => {
    // Object URLs outlive the component unless they are let go of.
    return () => files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
    // Intentionally on unmount only: removal revokes its own URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function remove(id: string) {
    const going = files.find((f) => f.id === id);
    if (going?.previewUrl) URL.revokeObjectURL(going.previewUrl);
    onChange(files.filter((f) => f.id !== id));
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add([...e.dataTransfer.files]);
        }}
        className={cn(
          'border border-dashed transition-colors',
          dragging ? 'border-accent bg-accent-wash' : 'border-rule bg-paper-2/50',
          disabled && 'opacity-60',
        )}
      >
        <input
          ref={input}
          id={inputId}
          type="file"
          multiple
          className="sr-only"
          disabled={disabled}
          // `accept` only filters the picker; a person can still switch it to
          // "All files". validateFile is what actually decides.
          accept={ALLOWED_MIME_TYPES.join(',')}
          onChange={(e) => {
            add([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />

        {files.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4">
            {files.map((picked, index) => (
              <li key={picked.id} className="group relative">
                <button
                  type="button"
                  onClick={() => setViewing(index)}
                  className="block w-full overflow-hidden rounded border border-rule bg-paper text-start"
                >
                  <span className="flex h-28 items-center justify-center bg-paper-3">
                    {picked.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={picked.previewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Kind mime={picked.file.type} />
                    )}
                  </span>
                  <span className="block px-2.5 py-2">
                    <span className="block truncate text-sm">{picked.file.name}</span>
                    <span className="machine block text-muted">{formatBytes(picked.file.size)}</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => remove(picked.id)}
                  disabled={disabled}
                  className="absolute top-1.5 end-1.5 rounded-full bg-ink/85 p-1.5 text-paper opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 disabled:hidden"
                >
                  <X size={14} />
                  <span className="sr-only">Remove {picked.file.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <label
          htmlFor={inputId}
          className={cn(
            'block cursor-pointer px-6 text-center',
            files.length > 0 ? 'border-t border-rule py-5' : 'py-12',
          )}
        >
          <FileUp className="mx-auto text-muted" size={22} aria-hidden />
          <span className="mt-3 block font-medium">
            {files.length > 0 ? t('upload.action.addMore') : t('upload.action.choose')}
          </span>
          <span className="mt-1 block text-sm text-muted">
            {t('file.accepted', { size: formatBytes(MAX_FILE_BYTES) })}
          </span>
        </label>
      </div>

      {rejections.length > 0 && (
        <ul role="alert" className="mt-3 space-y-1.5">
          {rejections.map((message) => (
            <li
              key={message}
              className="rounded-lg border-s-[3px] border-critical bg-critical/8 px-3 py-2 text-sm text-critical"
            >
              {message}
            </li>
          ))}
        </ul>
      )}

      {viewing !== null && files[viewing] && (
        <Lightbox
          files={files}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

/**
 * Formats a browser will draw in an `<img>`.
 *
 * TIFF is the odd one out and the one that matters here: it is what a flatbed
 * scanner writes, the archive accepts it, and Chrome and Firefox render it as
 * nothing at all.
 */
export function browserCanDraw(mimeType: string): boolean {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType);
}

function Kind({ mime }: { mime: string }) {
  const t = useMessages();
  const kind = fileKind(mime);

  // Named, not shrugged at. "TIFF" plus a sentence is the difference between
  // "my scan did not upload" and "my scan is here and being read".
  if (kind === 'image') {
    return (
      <span className="flex flex-col items-center gap-1.5 px-3 text-center">
        <ImageIcon size={24} className="text-muted" aria-hidden />
        <span className="eyebrow">{mime.replace('image/', '')}</span>
        <span className="text-xs leading-snug text-muted">
          {t('file.viewableCopy')}
        </span>
      </span>
    );
  }

  if (kind === 'audio') return <Music size={26} className="text-muted" aria-hidden />;
  return <FileUp size={26} className="text-muted" aria-hidden />;
}
