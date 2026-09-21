import Link from 'next/link';
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
    <div className="rounded-[var(--radius-card)] bg-surface px-8 py-16 text-center">
      <h2 className="font-display text-2xl sm:text-[2rem]">{title}</h2>
      <p className="mx-auto mt-3 max-w-md leading-relaxed text-muted">{body}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-7 inline-flex h-11 items-center rounded-full bg-primary px-5 font-medium text-white transition-colors duration-200 hover:bg-primary-strong"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/**
 * Says plainly that the values beside it were invented.
 *
 * Takes its sentence rather than reading the catalogue, and the reason is a
 * fault this project has already paid for once: `'use client'` marks the whole
 * **file**, not the component, so calling `useMessages` here would turn every
 * export in this module — `StatusPill`, `EmptyState`, `buttonClass` — into a
 * client export and pull them out of every server page that uses them. That
 * mistake took the deployed site down. One prop is cheaper than that.
 */
export function SimulatedNotice({ label, className }: { label: string; className?: string }) {
  return (
    <p
      className={cn(
        'rounded-lg border-l-[3px] border-caution bg-accent-wash px-4 py-3 font-mono text-xs leading-relaxed text-caution',
        className,
      )}
    >
      {label}
    </p>
  );
}

/**
 * The one button shape in the system.
 *
 * Three tones and nothing else, so that "the filled one is the thing you came
 * to do" holds on every screen. A pill, as on elevenlabs.io: 44px with 16px
 * text by default, 36px with 14px text for the quieter `sm`. Nothing jumps on
 * hover; the fill changes and that is all.
 */
export function buttonClass(
  tone: 'primary' | 'accent' | 'quiet' | 'danger' = 'primary',
  className?: string,
  size: 'md' | 'sm' = 'md',
) {
  const tones = {
    primary: 'bg-primary text-white hover:bg-primary-strong',
    accent: 'bg-accent-strong text-paper hover:bg-accent',
    quiet: 'border border-rule-strong bg-paper hover:bg-surface',
    danger: 'border border-critical text-critical hover:bg-critical/8',
  };
  const sizes = {
    md: 'h-11 px-5 text-base',
    sm: 'h-9 px-4 text-sm',
  };

  return cn(
    'inline-flex items-center justify-center gap-2 rounded-full font-medium',
    'transition-colors duration-200',
    'disabled:pointer-events-none disabled:opacity-50',
    sizes[size],
    tones[tone],
    className,
  );
}
