import type { AiAnalysis } from '@/lib/types';

type Waiting = {
  id: string;
  created_at: string;
  analysis: Pick<AiAnalysis, 'status'> | null;
  /** The latest reading of every other file. One unread page is an unread item (Inon, 21.10.2026). */
  otherReadings?: (AiAnalysis['status'] | null)[];
};

type ReadingState = 'ready' | 'failed' | 'pending' | 'missing';

function stateOf(status: AiAnalysis['status'] | null | undefined): ReadingState {
  return status === 'succeeded' ? 'ready' : status === 'failed' ? 'failed' : status === 'pending' ? 'pending' : 'missing';
}

/** The worst reading among the item's files: failed, then still reading, then none, then ready. */
export function readingState(item: Pick<Waiting, 'analysis' | 'otherReadings'>): ReadingState {
  const states = [stateOf(item.analysis?.status), ...(item.otherReadings ?? []).map(stateOf)];
  for (const worst of ['failed', 'pending', 'missing'] as const) if (states.includes(worst)) return worst;
  return 'ready';
}

export function reviewOrder<T extends Waiting>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    Number(readingState(a) !== 'ready') - Number(readingState(b) !== 'ready') ||
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export function waitingDays(createdAt: string, now = Date.now()): number {
  const elapsed = now - Date.parse(createdAt);
  return Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed / 86_400_000)) : 0;
}

export function needsCategory(status: string, category: string | null | undefined): boolean {
  return status === 'accepted' && !category;
}
