import { fail, ok, readJson } from '@/lib/api';
import { getMessages } from '@/lib/i18n';
import { RecoveryPassword } from '@/lib/auth/recovery';
import { createServerSupabase } from '@/lib/supabase/server';
import { z } from 'zod';

const Token = z.object({ tokenHash: z.string().regex(/^[a-zA-Z0-9_-]{20,256}$/) });
const Body = Token.and(RecoveryPassword);

export async function POST(request: Request) {
  const { t } = await getMessages();
  // Recovery is redeemed on an explicit POST: email scanners cannot consume
  // a one-use token just by opening the link. No credentials in browser storage.
  const input = await readJson(request);
  if (!Token.safeParse(input).success) return fail(400, 'expired_link', t('recovery.invalid'));
  const parsed = Body.safeParse(input);
  if (!parsed.success) return fail(400, 'invalid_request', t('recovery.passwordHint'));
  try {
    const supabase = await createServerSupabase();
    const verified = await supabase.auth.verifyOtp({ token_hash: parsed.data.tokenHash, type: 'recovery' });
    if (verified.error || !verified.data.user) return fail(400, 'expired_link', t('recovery.invalid'));
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) return fail(400, 'expired_link', t('recovery.retry'));
    // verifyOtp establishes the SSR session. No profile mutation, including pending.
    return ok({ redirect: '/' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return fail(400, 'expired_link', t('recovery.retry'));
  }
}
