import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, invalid, ok, unexpected } from '@/lib/api';
import { getCurrentAdmin } from '@/lib/supabase/server';
import { declineAccount, setAccountRole } from '@/lib/vocabulary/mutations';

/**
 * Approving, demoting, or declining an account. Administrators only.
 *
 * The two guards against locking the archive out of its own administration:
 * an administrator cannot change their own role, and the last administrator
 * cannot be removed by anyone.
 */

const Body = z.object({ role: z.enum(['pending', 'volunteer', 'admin']) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return fail(403, 'forbidden', 'Only an administrator can change an account.');

    const { id } = await params;
    if (id === admin.id) {
      return fail(409, 'self_change', 'Ask another administrator to change your own role.');
    }

    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) return invalid(parsed.error);

    await setAccountRole(id, parsed.data.role, admin.id);
    return ok({ role: parsed.data.role });
  } catch (error) {
    return unexpected(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return fail(403, 'forbidden', 'Only an administrator can decline a request.');

    const { id } = await params;
    if (id === admin.id) {
      return fail(409, 'self_change', 'You cannot delete your own account here.');
    }

    await declineAccount(id);
    return ok({ deleted: true });
  } catch (error) {
    return unexpected(error);
  }
}
