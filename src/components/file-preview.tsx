'use client';

import { FileText, Music, Video } from 'lucide-react';
import { fileKind } from '@/lib/files/validate';
import { useMessages } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import type { ItemFile } from '@/lib/types';
import { fileUrl, viewableUrl } from '@/lib/files/urls';

export function FilePreview({
  file,
  alt,
  className,
  fit = 'cover',
  still = false,
}: {
  file: ItemFile | null;
  alt: string;
  className?: string;
  fit?: 'cover' | 'contain';
  /**
   * A still, not a player.
   *
   * The portal grid is a wall of photographs, and a `<video controls>` in it
   * draws a black scrubber, a volume slider and an overflow menu inside a
   * frame the size of a postcard — the one tile that looks like a browser
   * chrome bug rather than a holding. A recording still deserves a plate on
   * the wall; it does not deserve to be playable from it.
   */
  still?: boolean;
}) {
  const t = useMessages();
  if (!file) {
    return <Placeholder icon={<FileText size={22} />} label={t('file.none')} className={className} />;
  }

  const kind = fileKind(file.mime_type);
  const src = fileUrl(file.id);

  if (kind === 'image') {
    return (
      // Signed URLs expire, so next/image optimisation would cache a dead URL.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={viewableUrl(file)}
        alt={alt}
        loading="lazy"
        className={cn('h-full w-full bg-paper-2', fit === 'cover' ? 'object-cover' : 'object-contain', className)}
      />
    );
  }

  if (kind === 'audio') {
    return (
      <div className={cn('flex h-full w-full flex-col justify-center gap-3 bg-paper-2 p-6', className)}>
        <Music size={22} className="text-muted" aria-hidden />
        <audio controls preload="none" src={src} className="w-full">
          {t('file.cannotPlay')}
        </audio>
      </div>
    );
  }

  if (kind === 'video') {
    if (still) {
      // `preload="metadata"` gives the browser the first frame to paint, so a
      // recording shows itself rather than a grey box — and with no controls
      // and no pointer events it reads as a picture, which on this page it is.
      return (
        <span className={cn('relative block h-full w-full overflow-hidden bg-ink', className)}>
          <video
            preload="metadata"
            muted
            playsInline
            tabIndex={-1}
            aria-hidden
            src={src}
            className="pointer-events-none h-full w-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-paper/85 shadow-soft backdrop-blur-sm">
              <Video size={18} className="text-ink" aria-hidden />
            </span>
          </span>
        </span>
      );
    }
    return <video controls preload="metadata" src={src} className={cn('h-full w-full bg-ink', className)} />;
  }

  // A captured web page. Named for what it is rather than by its MIME type,
  // because "text/plain" tells a volunteer nothing about what they are holding.
  if (kind === 'text') {
    return (
      <Placeholder
        icon={<FileText size={22} />}
        label={t('file.capturedPage')}
        href={src}
        className={className}
      />
    );
  }

  if (kind === 'pdf') {
    return (
      <Placeholder
        icon={<FileText size={22} />}
        label={t('file.pdf')}
        href={src}
        className={className}
      />
    );
  }

  return <Placeholder icon={<Video size={22} />} label={file.mime_type} href={src} className={className} />;
}

function Placeholder({
  icon,
  label,
  href,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  className?: string;
}) {
  const t = useMessages();
  const content = (
    <>
      <span className="text-muted" aria-hidden>
        {icon}
      </span>
      <span className="eyebrow">{label}</span>
      {href && <span className="text-xs text-accent underline underline-offset-2">{t('file.open')}</span>}
    </>
  );

  const classes = cn(
    'flex h-full w-full flex-col items-center justify-center gap-2 bg-paper-2 p-6 text-center',
    className,
  );

  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cn(classes, 'hover:bg-paper-3')}>
      {content}
    </a>
  ) : (
    <div className={classes}>{content}</div>
  );
}
