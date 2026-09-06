'use client';

import { useState } from 'react';
import { Link2, Loader2, Play, X } from 'lucide-react';
import { cn, formatBytes } from '@/lib/utils';
import { useMessages } from '@/lib/i18n/provider';

/**
 * Contributing an address instead of a file.
 *
 * An article about the Sassoon family is heritage material. Until now the only
 * way to give one to the archive was to screenshot it, which loses the text,
 * the date, and the address it came from.
 *
 * **The page is captured, not linked.** A link is a promise that somebody else
 * will keep a page online, and a newspaper's archive is exactly the thing that
 * disappears. What is stored is a snapshot — the readable text and the page's
 * lead image — which then goes through the same reading and the same review as
 * any uploaded file.
 *
 * A video is captured the same way with one difference said out loud on the
 * card: **the archive does not watch it.** YouTube does not hand out the media.
 * What is kept is the title, the channel and the thumbnail, and a record that
 * described footage nobody examined would be the exact failure this system
 * exists to prevent.
 */

export interface CapturedLink {
  sourceUrl: string;
  title: string;
  siteName: string | null;
  video: { provider: string; author: string | null } | null;
  files: {
    path: string;
    grant: string;
    expiresAt: number;
    fileName: string;
    mimeType: string;
    byteSize: number;
    width: number | null;
    height: number | null;
  }[];
}

export function LinkInput({
  captured,
  onCapture,
  onClear,
  disabled = false,
}: {
  captured: CapturedLink | null;
  onCapture: (link: CapturedLink) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const t = useMessages();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function read() {
    const address = url.trim();
    if (!address) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/links/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: address }),
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error.message);

      onCapture(body.data as CapturedLink);
      setUrl('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('upload.error.page'));
    } finally {
      setBusy(false);
    }
  }

  if (captured) {
    return (
      <div className="card relative rounded-xl bg-paper-2/60 p-5">
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="absolute top-3 right-3 rounded-full p-1.5 text-muted transition-colors hover:bg-critical/10 hover:text-critical disabled:opacity-40"
        >
          <X size={16} aria-hidden />
          <span className="sr-only">{t('upload.action.removeLink')}</span>
        </button>

        <p className="eyebrow mb-1.5 flex items-center gap-1.5">
          {captured.video ? <Play size={13} aria-hidden /> : <Link2 size={13} aria-hidden />}
          Captured from {captured.siteName ?? new URL(captured.sourceUrl).hostname}
        </p>

        <p className="pr-6 font-display text-lg leading-snug">{captured.title}</p>

        <p className="machine mt-1 break-all text-sm text-muted">{captured.sourceUrl}</p>

        <ul className="mt-3 flex flex-wrap gap-2">
          {captured.files.map((file) => (
            <li
              key={file.path}
              className="rounded-full border border-rule bg-paper px-3 py-1 text-sm text-muted"
            >
              {file.mimeType.startsWith('image/') ? t('upload.leadImage') : t('upload.capturedText')} ·{' '}
              {formatBytes(file.byteSize)}
            </li>
          ))}
        </ul>

        {/* Said on the card, not in a footnote. A record that implied the
            archive had watched the video would be worse than no record. */}
        {captured.video && (
          <p className="mt-3 rounded-lg border-l-[3px] border-caution bg-accent-wash px-3 py-2 text-sm leading-relaxed text-caution">
            The archive has not watched this video. It kept the title, the channel
            {captured.video.author ? ` (${captured.video.author})` : ''}, and the thumbnail — which
            is what {captured.video.provider} publishes about it.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void read();
            }
          }}
          disabled={disabled || busy}
          placeholder={t('upload.linkPlaceholder')}
          className="h-13 flex-1 rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:bg-accent-wash/30 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void read()}
          disabled={disabled || busy || !url.trim()}
          className={cn(
            'flex h-13 items-center justify-center gap-2 rounded-full border border-rule-strong px-6 font-medium transition-all duration-200',
            'hover:border-accent-strong hover:bg-accent-wash disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          {busy ? <Loader2 size={17} className="animate-spin" /> : <Link2 size={17} />}
          {busy ? t('upload.action.readingPage') : t('upload.action.readPage')}
        </button>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-muted">
        An article, a blog post, or a YouTube video. The archive keeps a copy of the text and the
        picture rather than only the address, because pages disappear.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border-l-[3px] border-critical bg-critical/8 px-3 py-2 text-sm text-critical"
        >
          {error}
        </p>
      )}
    </div>
  );
}
