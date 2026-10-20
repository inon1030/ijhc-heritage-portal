import { timingSafeEqual } from 'node:crypto';
import { fail, ok, unexpected } from '@/lib/api';
import { retryOneReading } from '@/lib/items/retry-reading';
import { dailyRetryLimit } from '@/lib/items/retry-policy';
import { getMessages } from '@/lib/i18n';

export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const offered = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || offered.length !== expected.length || !timingSafeEqual(offered, expected)) {
    const { t } = await getMessages();
    return fail(401, 'unauthenticated', t('phase2.forbidden'));
  }
  const started = Date.now();
  const limit = dailyRetryLimit(process.env.AI_RETRY_DAILY);
  let attempted = 0;
  try {
    // Shared deadline: a five-file run is never five platform timeouts.
    while (attempted < limit && Date.now() - started < 220_000) {
      if (!await retryOneReading(null, null, started)) break;
      attempted++;
    }
    return ok({ attempted, limit });
  } catch (error) { return unexpected(error, '/api/cron/reread'); }
}
