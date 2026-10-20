import type { ItemStatus, UserRole } from '@/lib/types';

export function canEditRecord(
  actor: { id: string; role: UserRole } | null,
  item: { status: ItemStatus; uploaded_by?: string | null; reviewed_by: string | null; deleted_at?: string | null },
): boolean {
  if (!actor || item.deleted_at) return false;
  if (actor.role === 'admin') return true;
  if (actor.role !== 'volunteer') return false;
  return item.status !== 'accepted' || item.uploaded_by === actor.id || item.reviewed_by === actor.id;
}
