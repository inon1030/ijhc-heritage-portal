import { after } from 'next/server';
import { createHash } from 'node:crypto';
import { ok, readJson } from '@/lib/api';
import { getMessages } from '@/lib/i18n';
import { RecoveryEmail, RecoveryLimiter } from '@/lib/auth/recovery';
import { clientKey } from '@/lib/rate-limit';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { sendMail } from '@/lib/mail';
import { recoveryMail } from '@/lib/mail/recovery';
import { siteUrl } from '@/lib/site';

const limiter = new RecoveryLimiter();
export async function POST(request: Request) {
  const { t, language } = await getMessages();
  const parsed = RecoveryEmail.safeParse(await readJson(request));
  const ipAllowed = limiter.allow(`ip:${clientKey(request)}`, 10);
  if (parsed.success) {
    const email = parsed.data.email;
    const addressAllowed = limiter.allow(`email:${createHash('sha256').update(email).digest('hex')}`, 3);
    if (ipAllowed && addressAllowed) after(async () => {
      // Everything account-dependent happens AFTER the identical response.
      try {
        const { data, error } = await createAdminSupabase().auth.admin.generateLink({
          type: 'recovery', email, options: { redirectTo: `${siteUrl()}/login/reset` },
        });
        if (error || !data.properties?.hashed_token) return;
        const url = new URL('/login/reset', siteUrl());
        url.searchParams.set('token_hash', data.properties.hashed_token);
        await sendMail(recoveryMail(email, url.toString(), language.code));
      } catch {
        // Never log the token, address or provider error, or expose existence.
        console.error('[recovery] delivery unavailable');
      }
    });
  }
  return ok({ message: t('recovery.neutral') }, { headers: { 'Cache-Control': 'no-store' } });
}
