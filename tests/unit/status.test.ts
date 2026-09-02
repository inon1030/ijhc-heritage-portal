import { describe, expect, it } from 'vitest';
import { REVIEW_QUEUE_STATUSES, allowedTransitions, canTransition } from '@/lib/items/status';

describe('status transitions', () => {
  it('lets a reviewer publish a pending item', () => {
    expect(canTransition('pending', 'accepted')).toBe(true);
  });

  it('lets a published item be withdrawn', () => {
    expect(canTransition('accepted', 'rejected')).toBe(true);
  });

  it('lets a rejection be undone — the demo could not', () => {
    expect(canTransition('rejected', 'pending')).toBe(true);
  });

  it('does not let a rejected item jump straight to published', () => {
    expect(canTransition('rejected', 'accepted')).toBe(false);
  });

  it('never offers a transition to the state it is already in', () => {
    for (const status of ['pending', 'accepted', 'rejected', 'shadow_gallery'] as const) {
      expect(allowedTransitions(status)).not.toContain(status);
    }
  });

  it('shows pending and shadow gallery items in the queue', () => {
    expect(REVIEW_QUEUE_STATUSES).toEqual(['pending', 'shadow_gallery']);
  });
});
