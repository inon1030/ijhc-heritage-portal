'use client';

import { FileText, Music, Play, Video } from 'lucide-react';
import { PlayableVideo } from '@/components/playable-video';
import { fileKind } from '@/lib/files/validate';
import { useMessages } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import type { ItemFile } from '@/lib/types';
import { fileUrl, thumbUrl, viewableUrl } from '@/lib/files/urls';

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
      // A tile asks for a tile; the master is what the lightbox and the record
      // page open.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={still ? thumbUrl(file) : viewableUrl(file)}
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
      /*
       * A plate, and not one frame of the recording.
       *
       * This used to be a muted `<video preload="metadata">`, on the reasoning
       * that a first frame reads better than a grey box. Measured on the live
       * portal, 16.09.2026: Chrome did not stop at the metadata. It pulled the
       * whole 46 MB file to draw a card 91 pixels wide — the grid weighed 47 MB,
       * and every visitor paid it before reading a word.
       *
       * A poster exists only if a derivative was made for this file; there is
       * no frame grabber on the server. So the tile is a plate: the community
       * stripe and the title still identify the record, and the recording plays
       * on the record's own page, where somebody asked for it.
       */
      return (
        <span className={cn('relative block h-full w-full overflow-hidden bg-surface-2', className)}>
          {file.preview_path && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbUrl(file)}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover opacity-90"
            />
          )}
          <span className="absolute inset-0 flex items-center justify-center">
            {/* The same round play mark the record page presses, so a tile
                says "recording" in the shape it will have when it plays. */}
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-white shadow-lift ring-4 ring-white/70">
              <Play size={26} fill="currentColor" className="translate-x-[2px]" aria-hidden />
            </span>
          </span>
        </span>
      );
    }
    // Large, light, and started from the button in its middle (21.09.2026).
    return (
      <PlayableVideo
        src={src}
        poster={file.preview_path ? thumbUrl(file) : null}
        label={`${t('file.play')}: ${alt}`}
        className={cn('aspect-video w-full rounded-xl', className)}
      />
    );
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
