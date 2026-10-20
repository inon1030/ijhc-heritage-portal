import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';

export async function readDuplicates(itemId: string) {
  const db = await createServerSupabase();
  const { data, error } = await db.from('item_duplicates')
    .select('id, item_id, other_item_id, reason').is('resolved_at', null)
    .or(`item_id.eq.${itemId},other_item_id.eq.${itemId}`);
  if (error) throw error;
  const pairs = data ?? [];
  if (!pairs.length) return [];
  const ids = pairs.map((p) => p.item_id === itemId ? p.other_item_id : p.item_id);
  const { data: items, error: itemError } = await db.from('items')
    .select('id,title,created_at,item_files(id,mime_type,is_primary)')
    .in('id', ids).is('deleted_at', null);
  if (itemError) throw itemError;
  return pairs.flatMap((pair) => {
    const item = items?.find((i) => i.id === (pair.item_id === itemId ? pair.other_item_id : pair.item_id));
    if (!item) return [];
    const cover = item.item_files.find((f) => f.is_primary && f.mime_type.startsWith('image/'));
    return [{ id: pair.id as string, reason: pair.reason as string, item: { id: item.id as string, title: item.title as string, thumbnail: cover ? `/api/files/${cover.id}?thumb` : null } }];
  });
}
