import type { AiAnalysis } from '@/lib/types';

type Waiting = { id: string; created_at: string; analysis: Pick<AiAnalysis, 'status'> | null };

export function readingState(item: Pick<Waiting, 'analysis'>): 'ready' | 'failed' | 'pending' | 'missing' {
  const status = item.analysis?.status;
  return status === 'succeeded' ? 'ready' : status === 'failed' ? 'failed' : status === 'pending' ? 'pending' : 'missing';
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
