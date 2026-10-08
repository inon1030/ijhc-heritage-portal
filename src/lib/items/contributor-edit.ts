import { z } from 'zod';

/** Same limits as submission; a strict allowlist excludes catalogue and identity fields. */
export const ContributorEdit = z.object({
  title: z.string().trim().min(1).max(200),
  contributorDescription: z.string().trim().max(4000).nullable(),
}).strict();

export type ReceiptState = { status: string; access: string; deleted_at: string | null };

export function contributorCanEdit(item: ReceiptState | null): boolean {
  return !!item && item.status === 'pending' && item.deleted_at === null;
}

export function contributorClosedKey(item: ReceiptState | null) {
  if (!item || item.deleted_at !== null) return 'receipt.editWithdrawn' as const;
  return item.status === 'accepted' && item.access === 'public'
    ? 'receipt.editPublished' as const
    : 'receipt.editReviewed' as const;
}
