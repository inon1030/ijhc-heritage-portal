import { createBrowserSupabase } from '@/lib/supabase/browser';

/** Storage transport only; catalogue records are submitted through /api/items. */
export async function uploadSignedFile(path: string, token: string, file: File) {
  return createBrowserSupabase().storage.from('heritage').uploadToSignedUrl(path, token, file);
}
