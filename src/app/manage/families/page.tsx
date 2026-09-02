import type { Metadata } from 'next';
import { FamilyManager } from '@/components/family-manager';
import { listContributors } from '@/lib/contributors';
import { getCurrentVolunteer } from '@/lib/supabase/server';
import { listFamilies } from '@/lib/vocabulary/queries';

export const metadata: Metadata = { title: 'Families' };
export const dynamic = 'force-dynamic';

/**
 * The family register, and who belongs to each family.
 *
 * The two are one screen because they are one question. A family name is only
 * useful to the archive if it can be attached to material, and the strongest
 * thing the archive holds for attaching it is the address the material arrived
 * from. `listContributors` returns nothing without a volunteer session — the
 * register is `is_volunteer()`, not public.
 */
export default async function FamiliesPage() {
  const [volunteer, families, contributors] = await Promise.all([
    getCurrentVolunteer(),
    listFamilies(),
    // Deliberately not caught. An empty register renders as "no addresses are
    // linked to it" in the family-delete confirmation, so swallowing a failure
    // here turns a broken query into a false reassurance shown to an
    // administrator immediately before an irreversible cascade. Failing the
    // page is the honest outcome; error.tsx handles it.
    listContributors(),
  ]);

  return (
    <FamilyManager
      families={families}
      contributors={contributors}
      isAdmin={volunteer?.role === 'admin'}
    />
  );
}
