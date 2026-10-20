import Link from 'next/link';
import { portalHref } from '@/lib/items/portal-facets';

export function RelatedValue({ filter, value, count, label, children }: {
  filter: string; value: string | null; count: number; label: string; children: React.ReactNode;
}) {
  if (!value || count < 1) return <>{children}</>;
  return <Link href={portalHref(filter, value)} aria-label={label}
    className="inline-flex min-h-11 min-w-11 max-w-full items-center rounded-md py-2 text-accent underline decoration-rule-strong underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2">
    {children}
  </Link>;
}
