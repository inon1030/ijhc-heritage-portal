import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, invalid, ok, unexpected } from '@/lib/api';
import { issueGrant } from '@/lib/files/grant';
import { buildStoragePath, isValidStorageKey } from '@/lib/files/paths';
import { MAX_FILE_BYTES, validateFile } from '@/lib/files/validate';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { createAdminSupabase } from '@/lib/supabase/admin';

const Body = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  byteSize: z.number().int().positive().max(MAX_FILE_BYTES),
});

/**
 * Hands back a one-shot upload token so the browser can send the file straight
 * to storage. The file never passes through this server, which is what lets a
 * 50 MB scan work on a platform with a 4.5 MB request body limit.
 */
export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(clientKey(request));
    if (!limit.allowed) {
      return fail(429, 'rate_limited', `Too many uploads. Try again in ${limit.retryAfterSeconds} seconds.`);
    }

    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) return invalid(parsed.error);

    const rejection = validateFile(parsed.data);
    if (rejection) return fail(415, rejection.code, rejection.message);

    const path = buildStoragePath(parsed.data.fileName);

    // Belt and braces: storage refuses a key outside its character set, and a
    // failure there surfaces to the contributor as an opaque "Invalid key".
    // Catching it here means a bad key is our bug, not their problem.
    if (!isValidStorageKey(path)) {
      console.error('[uploads] built an invalid storage key', { fileName: parsed.data.fileName, path });
      return fail(500, 'internal_error', 'Could not prepare the upload. Try again.');
    }

    const { data, error } = await createAdminSupabase()
      .storage.from('heritage')
      .createSignedUploadUrl(path);

    if (error || !data) return fail(502, 'storage_unavailable', 'Could not start the upload. Try again.');

    // The grant is what lets /api/analyze and /api/items know this path came
    // from here rather than from a stranger who guessed one.
    return ok({ path: data.path, token: data.token, ...issueGrant(data.path) });
  } catch (error) {
    return unexpected(error);
  }
}
