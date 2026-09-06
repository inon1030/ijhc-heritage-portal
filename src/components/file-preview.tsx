'use client';

import { FileText, Music, Video } from 'lucide-react';
import { fileKind } from '@/lib/files/validate';
import { useMessages } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import type { ItemFile } from '@/lib/types';

/**
 * Every asset is fetched through /api/files/[id], which checks permission and
 * then redirects to a short-lived signed URL. Storage paths are never exposed.
 */
export function fileUrl(fileId: string) {
  return `/api/files/${fileId}`;
}

/**
 * The address to put in an `<img>`.
 *
 * A TIFF master will not render in Chrome or Firefox, so anything with a
 * derivative is shown through it. The master stays one click away and is what
 * "Open file" reaches. The route makes the same permission decision either way.
 */
export function viewableUrl(file: ItemFile) {
  return file.preview_path ? `/api/files/${file.id}?rendition` : `/api/files/${file.id}`;
}

export function FilePreview({
  file,
  alt,
  className,
  fit = 'cover',
}: {
  file: ItemFile | null;
  alt: string;
  className?: string;
  fit?: 'cover' | 'contain';
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
