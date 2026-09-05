import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, invalid, ok, readJson, unexpected } from '@/lib/api';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { createAdminSupabase } from '@/lib/supabase/admin';

/**
 * Someone asks for a volunteer account.
 *
 * The account is created straight away and is worth nothing: `profiles.role`
 * defaults to 'pending' (migration 0008), and every gate in the system —
 * `is_volunteer()` in the database, `getCurrentVolunteer()` on the server, the
 * masthead in the render — reads the role rather than the existence of a row.
 * So a pending user can sign in and see exactly what a stranger sees.
 *
 * Creating the auth user now, rather than storing the request and creating it
 * on approval, is what keeps the password out of our hands entirely. It goes
 * from the browser to Supabase Auth and is never written anywhere we control.
 */

const Body = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(10).max(200),
  fullName: z.string().trim().min(2).max(120),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = Body.safeParse(await readJson(request));
    if (!parsed.success) return invalid(parsed.error);

    // Limit after validating, not before. A malformed body is rejected without
    // touching anything, so it should not spend someone's budget — otherwise
    // five typos lock a person out for an hour. What needs limiting is the part
    // that leaves a permanent row behind, and that is below.
    const limit = rateLimit(`account:${clientKey(request)}`, { limit: 5, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) {
      return fail(429, 'rate_limited', 'Too many requests from here. Try again later.');
    }

    const { email, password, fullName } = parsed.data;
    const admin = createAdminSupabase();

    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      // No mail service is configured, and an unconfirmed account cannot sign
      // in to be told it is pending. Confirmation here proves nothing anyway —
      // the administrator's approval is the check that matters.
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (error) {
      // An address that already has an account is not an error worth
      // distinguishing out loud: saying so tells a stranger who has an account
      // here. Both paths end at the same sentence.
      const alreadyExists = /already|registered|exists/i.test(error.message);
      if (!alreadyExists) {
        console.error('[request-account] createUser failed', error);
        return fail(502, 'account_not_created', 'The request could not be recorded. Try again shortly.');
      }
    }

    return ok({ requested: true }, { status: 202 });
  } catch (error) {
    return unexpected(error);
  }
}
