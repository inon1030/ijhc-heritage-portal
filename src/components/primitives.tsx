import Link from 'next/link';
import { COMMUNITY_COLORS } from '@/lib/communities';
import { cn } from '@/lib/utils';
import { STATUS_LABELS, type ItemStatus } from '@/lib/types';

const STATUS_STYLES: Record<ItemStatus, string> = {
  pending: 'bg-accent-wash text-caution ring-accent/25',
  accepted: 'bg-sage-wash text-positive ring-positive/25',
  rejected: 'bg-critical/8 text-critical ring-critical/25',
  shadow_gallery: 'bg-paper-3 text-muted ring-rule-strong',
};

export function StatusPill({ status, className }: { status: ItemStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 font-mono text-xs tracking-wide ring-1',
        STATUS_STYLES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * The double ring.
 *
 * Two concentric rings around a mark, the inner one in the colour of whatever
 * it stands for. Reserved for the handful of places that carry a number or a
 * step — the streams on the portal, the stages of contributing. Using it on
 * every icon would leave it meaning nothing.
 */
export function RingMark({
  children,
  color,
  size = 56,
  className,
}: {
  children: React.ReactNode;
  /** A CSS colour. Defaults to terracotta. */
  color?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn('ring-mark shrink-0', className)}
      style={
        {
          width: size,
          height: size,
          '--ring-mark-inner': color ?? 'var(--color-accent-strong)',
        } as React.CSSProperties
      }
    >
      {children}
    </span>
  );
}


/** A labelled fact. `machine` marks values a model produced rather than a person. */
export function Field({
  label,
  children,
  machine = false,
}: {
  label: string;
  children: React.ReactNode;
  machine?: boolean;
}) {
  return (
    <div>
      <dt className="eyebrow mb-1">{label}</dt>
      <dd className={machine ? 'machine text-ink-2' : 'leading-relaxed'}>{children}</dd>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-xl border border-dashed border-rule-strong bg-paper-2/60 px-8 py-16 text-center">
      <h2 className="font-display text-xl sm:text-2xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-md leading-relaxed text-muted">{body}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-7 inline-flex h-12 items-center rounded-full bg-ink px-6 font-medium text-paper shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-ink-2 hover:shadow-lift"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** Says plainly that the values beside it were invented. */
export function SimulatedNotice({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        'rounded-lg border-l-[3px] border-caution bg-accent-wash px-4 py-3 font-mono text-xs leading-relaxed text-caution',
        className,
      )}
    >
      DEMO — SIMULATED. No AI model examined this file. Set GEMINI_API_KEY to get real analysis.
    </p>
  );
}

/**
 * The one button shape in the system.
 *
 * Three tones and nothing else, so that "the filled one is the thing you came
 * to do" holds on every screen. Height is fixed at 48px because a target you
 * have to aim at is a target some people miss.
 */
export function buttonClass(
  tone: 'primary' | 'accent' | 'quiet' | 'danger' = 'primary',
  className?: string,
) {
  const tones = {
    primary: 'bg-ink text-paper shadow-soft hover:bg-ink-2 hover:shadow-lift',
    accent: 'bg-accent-strong text-paper shadow-soft hover:bg-accent hover:shadow-lift',
    quiet: 'border border-rule-strong bg-paper hover:border-accent-strong hover:bg-accent-wash',
    danger: 'border border-critical text-critical hover:bg-critical/8',
  };

  return cn(
    'inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 font-medium',
    'transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0',
    'disabled:pointer-events-none disabled:opacity-50',
    tones[tone],
    className,
  );
}
