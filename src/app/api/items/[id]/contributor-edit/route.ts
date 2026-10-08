import { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { fail, invalid, ok, readJson, unexpected } from '@/lib/api';
import { getMessages } from '@/lib/i18n';
import { verifyReceipt } from '@/lib/items/receipt';
import { getReceiptItem } from '@/lib/items/queries';
import { editContributorItem } from '@/lib/items/mutations';
import { ContributorEdit, contributorCanEdit, contributorClosedKey } from '@/lib/items/contributor-edit';
import { clientKey, rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const token = request.nextUrl.searchParams.get('t');
    // Must precede every query, including locale resolution.
    if (!verifyReceipt(id, token)) return fail(403, 'forbidden', 'receipt.badLink');
    const { t } = await getMessages();
    const limit = rateLimit(`contributor-edit:${clientKey(request)}`, { limit: 20, windowMs: 10 * 60_000 });
    if (!limit.allowed) return fail(429, 'rate_limited', t('receipt.editRateLimited', { seconds: limit.retryAfterSeconds }));
    const parsed = ContributorEdit.safeParse(await readJson(request));
    if (!parsed.success) return invalid(parsed.error);
    const current = await getReceiptItem(id, token);
    if (!contributorCanEdit(current)) return fail(409, contributorClosedKey(current), t(contributorClosedKey(current)));
    const result = await editContributorItem(id, token, parsed.data);
    if (!result.ok) {
      if (result.code === 'edit_closed') {
        const latest = await getReceiptItem(id, token);
        const key = contributorClosedKey(latest);
        return fail(409, key, t(key));
      }
      return fail(result.code === 'forbidden' ? 403 : 400, result.code, t('receipt.editError'));
    }
    revalidatePath(`/receipt/${id}`);
    revalidatePath(`/review/${id}`);
    revalidatePath('/review');
    return ok({ saved: true });
  } catch (error) {
    return unexpected(error, '/api/items/[id]/contributor-edit');
  }
}
