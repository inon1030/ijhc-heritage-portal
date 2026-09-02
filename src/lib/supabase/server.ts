import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';
import type { Profile } from '@/lib/types';

/**
 * Request-scoped client that carries the visitor's session.
 *
 * Reads through this client are governed by RLS, which is the point: an
 * anonymous visitor physically cannot select a pending item, no matter what
 * the calling code asks for.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Session refresh is handled by middleware instead.
        }
      },
    },
  });
}

/**
 * The signed-in account, whatever its state — including one still waiting for
 * an administrator. Screens that gate on permission want `getCurrentVolunteer`
 * or `getCurrentAdmin`; this one is for telling a pending user why they cannot
 * see anything yet.
 */
export async function getCurrentProfile() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return data ?? null;
}

/**
 * The signed-in account, only if it has actually been approved.
 *
 * `profiles.role` starts at 'pending' since 0008. A pending row is a real
 * session with a real profile and no rights, so "is there a profile" — which is
 * what this used to mean — is no longer the same question as "may they review".
 */
export async function getCurrentVolunteer(): Promise<Profile | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  return profile.role === 'volunteer' || profile.role === 'admin' ? profile : null;
}

/** The signed-in administrator, or null. Vocabulary and accounts are theirs. */
export async function getCurrentAdmin(): Promise<Profile | null> {
  const profile = await getCurrentProfile();
  return profile?.role === 'admin' ? profile : null;
}
