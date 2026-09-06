import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { FilePreview } from '@/components/file-preview';
import { COMMUNITY_COLORS } from '@/lib/communities';
import { type Item, type ItemFile } from '@/lib/types';
import { getMessages } from '@/lib/i18n';
import { categoryKey, communityKey } from '@/lib/i18n/labels';

/**
 * A record, as a plate on a wall.
 *
 * ── why the caption is on the picture and not under it ──────────────────────
 *
 * The card used to be an image with five lines of text beneath it: category,
 * title, two lines of description, community and source. Accurate, and it made
 * a grid of photographs read as a spreadsheet with pictures in it — the text
 * was more than half the height of every card, so the eye landed on prose.
 *
 * Now the image is the card. The title sits on a scrim across the foot of it,
 * always legible and never hidden behind a hover — a caption you have to
 * discover is not a caption. Category and stream ride above it in small caps.
 * Everything else is one click away on the record, which is where somebody who
 * wants the description is going anyway.
 *
 * The scrim is a gradient rather than a bar so the picture continues to read
 * through it; the archive's holdings are photographs of people, and cropping
 * the bottom sixth of one behind a solid block is a real loss.
 *
 * A square rather than 4:3. A wall wants a rhythm, and mixed portrait and
 * landscape scans in a 4:3 frame produce neither.
 */
export async function ItemCard({ item }: { item: Item & { file: ItemFile | null } }) {
  const { t } = await getMessages();
  return (
    <Link
      href={`/portal/${item.id}`}
      className="group relative block aspect-square overflow-hidden rounded-xl bg-paper-2 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-offset-4"
    >
      <div className="absolute inset-0 transition-transform duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.05]">
        <FilePreview file={item.file} alt={item.title} still />
      </div>

      {/*
        Strong enough to carry white type over a *light* scan.
        
        The first version was from-black/75 with the title sitting where the
        gradient had already thinned to about a third — fine over a dark
        photograph and marginal over a cream banknote, which is half of what
        this archive holds. Paper is the common case here, not the exception.
      */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/55 to-transparent"
      />

      {item.community && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1 transition-[height] duration-300 group-hover:h-1.5"
          style={{ backgroundColor: COMMUNITY_COLORS[item.community] }}
        />
      )}

      <span
        aria-hidden
        className="absolute top-3 end-3 flex h-9 w-9 translate-y-1 items-center justify-center rounded-full bg-paper/90 opacity-0 shadow-soft backdrop-blur-sm transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
      >
        <ArrowUpRight size={17} className="text-accent-strong" />
      </span>

      {/*
        Sized for the tile it is in, not for the desktop one.
        
        At two columns on a phone a plate is about 165px across, and the
        desktop caption — an 18px title over an eyebrow carrying category and
        stream — wrapped to five lines and covered the photograph it was
        captioning. The eyebrow is one line or nothing, and the title steps up
        with the tile.
      */}
      <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-4">
        <p className="eyebrow mb-0.5 truncate text-[0.6rem] text-paper/75 sm:mb-1 sm:text-[0.65rem]">
          {t(categoryKey(item.category))}
          {item.community ? ` · ${t(communityKey(item.community))}` : ''}
        </p>
        <h3
          dir="auto"
          className="line-clamp-2 font-display text-[0.9rem] leading-tight text-paper drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] sm:text-base sm:leading-snug lg:text-lg"
        >
          {item.title}
        </h3>
      </div>
    </Link>
  );
}

export async function ItemRow({ item }: { item: Item & { file: ItemFile | null } }) {
  const { t } = await getMessages();
  return (
    <Link
      href={`/portal/${item.id}`}
      className="card card-interactive group flex gap-5 overflow-hidden p-3 focus-visible:outline-offset-4"
    >
      <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-paper-2">
        <FilePreview file={item.file} alt={item.title} />
        {item.community && (
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1"
            style={{ backgroundColor: COMMUNITY_COLORS[item.community] }}
          />
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1 self-center pe-2">
        <p className="eyebrow">{t(categoryKey(item.category))}</p>
        <h3 className="truncate font-display text-xl transition-colors group-hover:text-accent">
          {item.title}
        </h3>
        {item.description && (
          <p dir="auto" className="line-clamp-2 text-muted">
            {item.description}
          </p>
        )}
      </div>

      <ArrowUpRight
        size={19}
        aria-hidden
        className="mt-2 me-2 shrink-0 text-rule-strong transition-colors group-hover:text-accent-strong"
      />
    </Link>
  );
}
