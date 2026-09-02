import type { ItemStatus } from '@/lib/types';

/**
 * The transitions a reviewer is allowed to make.
 *
 * The demo let an item reach `rejected` and then showed it on no screen at all,
 * so a mistaken rejection could not be undone. Here every terminal state can
 * return to `pending`.
 */
const ALLOWED: Record<ItemStatus, ItemStatus[]> = {
  pending: ['accepted', 'rejected', 'shadow_gallery'],
  accepted: ['pending', 'rejected', 'shadow_gallery'],
  rejected: ['pending'],
  shadow_gallery: ['pending', 'accepted', 'rejected'],
};

export function canTransition(from: ItemStatus, to: ItemStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function allowedTransitions(from: ItemStatus): ItemStatus[] {
  return ALLOWED[from];
}

/** Statuses that appear in the review queue. */
export const REVIEW_QUEUE_STATUSES: ItemStatus[] = ['pending', 'shadow_gallery'];
