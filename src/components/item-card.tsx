import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { FilePreview } from '@/components/file-preview';
import { COMMUNITY_COLORS } from '@/lib/communities';
import { categoryLabel, COMMUNITY_LABELS, type Item, type ItemFile } from '@/lib/types';

/**
 * A record, as a card.
 *
 * The community's colour runs along the bottom of the image and thickens on
 * hover — the one moving part, because the archive's own idea is that every
 * record belongs to a stream, and a card is where that is worth repeating.
 */
export function ItemCard({ item }: { item: Item & { file: ItemFile | null } }) {
  return (
    <Link
      href={`/portal/${item.id}`}
      className="card card-interactive group block h-full overflow-hidden focus-visible:outline-offset-4"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-paper-2">
        <div className="h-full w-full transition-transform duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]">
          <FilePreview file={item.file} alt={item.title} />
        </div>

        {item.community && (
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1 transition-[height] duration-300 group-hover:h-1.5"
            style={{ backgroundColor: COMMUNITY_COLORS[item.community] }}
          />
        )}

        <span
          aria-hidden
          className="absolute top-3 right-3 flex h-9 w-9 translate-y-1 items-center justify-center rounded-full bg-paper/90 opacity-0 shadow-soft backdrop-blur-sm transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
        >
          <ArrowUpRight size={17} className="text-accent-strong" />
        </span>
      </div>

      <div className="space-y-2 p-5">
        <p className="eyebrow">{categoryLabel(item.category)}</p>
        <h3 className="font-display text-xl leading-snug transition-colors group-hover:text-accent">
          {item.title}
        </h3>
        {item.description && (
          <p className="line-clamp-2 leading-relaxed text-muted">{item.description}</p>
        )}
        <p className="flex items-center gap-2 pt-1 text-sm text-muted">
          {item.community && (
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: COMMUNITY_COLORS[item.community] }}
            />
          )}
          {item.community ? COMMUNITY_LABELS[item.community] : 'Community not identified'}
          {item.source ? ` · ${item.source}` : ''}
        </p>
      </div>
    </Link>
  );
}

export function ItemRow({ item }: { item: Item & { file: ItemFile | null } }) {
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

      <div className="min-w-0 flex-1 space-y-1 self-center pr-2">
        <p className="eyebrow">{categoryLabel(item.category)}</p>
        <h3 className="truncate font-display text-xl transition-colors group-hover:text-accent">
          {item.title}
        </h3>
        {item.description && <p className="line-clamp-2 text-muted">{item.description}</p>}
      </div>

      <ArrowUpRight
        size={19}
        aria-hidden
        className="mt-2 mr-2 shrink-0 text-rule-strong transition-colors group-hover:text-accent-strong"
      />
    </Link>
  );
}
