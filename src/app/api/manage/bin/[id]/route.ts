import { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { fail, ok, unexpected } from '@/lib/api';
import { purgeItem, restoreItem } from '@/lib/items/mutations';
import { getCurrentAdmin } from '@/lib/supabase/server';

/**
 * The two ways out of the bin. Administrators only.
 *
 * POST restores; DELETE destroys. Both are guarded twice over — here, and by
 * `items_admin_bin_update` / `items_admin_delete`, which additionally require
 * the record to be in the bin already. A volunteer who reaches this route with
 * a valid session still cannot restore anything, and nobody at all can destroy
 * a live record in one step.
 */

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await getCurrentAdmin())) {
      return fail(403, 'forbidden', 'Only an administrator can restore a record.');
    }

    const { id } = await params;
    const restored = await restoreItem(id);
    if (!restored) return fail(404, 'not_found', 'That record is not in the bin.');

    revalidatePath('/manage/bin');
    revalidatePath('/review');
    revalidatePath('/portal');
    revalidatePath('/');

    return ok({ id, restored: true });
  } catch (error) {
    return unexpected(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await getCurrentAdmin())) {
      return fail(403, 'forbidden', 'Only an administrator can destroy a record.');
    }

    const { id } = await params;
    const purged = await purgeItem(id);
    if (!purged) return fail(404, 'not_found', 'That record is not in the bin.');

    revalidatePath('/manage/bin');

    return ok({ id, purged: true });
  } catch (error) {
    return unexpected(error);
  }
}
