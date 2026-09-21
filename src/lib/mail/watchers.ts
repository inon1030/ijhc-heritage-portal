import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';
import type { Watcher } from './recipients';

/**
 * The accounts that asked to be told, read with the service role.
 *
 * A submission arrives from somebody who is not signed in, and a publication's
 * mail is sent after the request has finished, so neither has a session that
 * RLS would let read other people's addresses. The service role reads only
 * these four columns of the accounts that switched a notice on, the addresses
 * go straight to the mail server, and nothing of it is returned to a browser.
 */
export async function readWatchers(): Promise<Watcher[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('profiles')
    .select('email, role, notify_uploads, notify_publications')
    .in('role', ['volunteer', 'admin'])
    .or('notify_uploads.eq.true,notify_publications.eq.true');
  if (error) throw error;
  return (data ?? []) as Watcher[];
}
