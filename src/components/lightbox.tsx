'use client';

import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useMessages } from '@/lib/i18n/provider';
import type { PickedFile } from '@/components/file-picker';
import { fileKind } from '@/lib/files/validate';
import { formatBytes } from '@/lib/utils';

/**
 * Full-screen look at what you are about to contribute.
 *
 * Contributors are handling scans of documents in scripts they may not read, so
 * a 112px thumbnail is not enough to tell page four from page five. Escape and
 * the arrow keys work, because anyone checking eleven scans will use them.
 *
 * Everything shown here is a local object URL. Nothing has been uploaded yet.
 */
export function Lightbox({
  files,
  index,
  onIndex,
  onClose,
}: {
  files: PickedFile[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const t = useMessages();
  const closeButton = useRef<HTMLButtonElement>(null);
  const current = files[index];

  useEffect(() => {
    closeButton.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight' && index < files.length - 1) onIndex(index + 1);
      if (event.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    }
    window.addEventListener('keydown', onKey);

    // The page behind must not scroll while this is over it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [index, files.length, onClose, onIndex]);

  if (!current) return null;

  const kind = fileKind(current.file.type);
  // Images use `previewUrl`, which is deliberately null for a format the
  // browser cannot draw. Everything else is played or embedded straight.
  const url = current.previewUrl ?? URL.createObjectURL(current.file);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.file.name}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col bg-ink/95 backdrop-blur-sm"
    >
      <header className="flex items-center gap-4 px-5 py-4 text-paper">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-lg">{current.file.name}</span>
          <span className="machine block text-paper/60">
            {current.file.type || 'unknown type'} · {formatBytes(current.file.size)}
            {files.length > 1 && ` · ${index + 1} of ${files.length}`}
          </span>
        </span>

        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          className="rounded-md p-2.5 transition-colors hover:bg-paper/10"
        >
          <X size={22} />
          <span className="sr-only">{t('file.close')}</span>
        </button>
      </header>

      <div
        className="flex flex-1 items-center justify-center gap-4 overflow-auto px-5 pb-8"
        onClick={(event) => event.stopPropagation()}
      >
        {files.length > 1 && (
          <Arrow
            direction="left"
            disabled={index === 0}
            onClick={() => onIndex(index - 1)}
          />
        )}

        <div className="flex max-h-full min-w-0 flex-1 items-center justify-center">
          {/* A TIFF has no object URL, because one would be a valid address
              that renders as nothing — the blank a contributor cannot tell
              from a failed upload. Say what it is instead. */}
          {kind === 'image' &&
            (current.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.previewUrl}
                alt={current.file.name}
                className="max-h-[78vh] max-w-full object-contain"
              />
            ) : (
              <p className="max-w-sm text-center leading-relaxed text-paper/70">
                {current.file.type.replace('image/', '').toUpperCase()} is a format browsers cannot
                display. Your file is here and will be read normally — a viewable copy is made when
                the archive analyses it.
              </p>
            ))}
          {kind === 'pdf' && (
            <iframe src={url} title={current.file.name} className="h-[78vh] w-full max-w-3xl bg-paper" />
          )}
          {kind === 'audio' && <audio src={url} controls className="w-full max-w-xl" />}
          {kind === 'video' && <video src={url} controls className="max-h-[78vh] max-w-full" />}
          {kind === 'other' && (
            <p className="text-paper/70">{t('file.noPreview')}</p>
          )}
        </div>

        {files.length > 1 && (
          <Arrow
            direction="right"
            disabled={index === files.length - 1}
            onClick={() => onIndex(index + 1)}
          />
        )}
      </div>
    </div>
  );
}

function Arrow({
  direction,
  disabled,
  onClick,
}: {
  direction: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
}) {
  const t = useMessages();
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 rounded-full p-3 text-paper transition-colors hover:bg-paper/10 disabled:opacity-25"
    >
      <Icon size={26} />
      <span className="sr-only">{direction === 'left' ? t('file.previous') : t('file.next')}</span>
    </button>
  );
}
