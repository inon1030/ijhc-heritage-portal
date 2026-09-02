import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, serviceRoleKey } from '@/lib/env';

/**
 * Service-role client. Bypasses RLS, so it is used in exactly three places:
 *
 *   1. creating an item from an anonymous upload (status is forced to 'pending')
 *   2. minting signed upload URLs
 *   3. minting signed download URLs after an explicit permission check
 *
 * The `server-only` import makes it a build error to reach this from a client
 * component.
 */
export function createAdminSupabase() {
  return createClient(SUPABASE_URL, serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
