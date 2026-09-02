import type { Metadata } from 'next';
import { VocabularyManager } from '@/components/vocabulary-manager';
import { getCurrentVolunteer } from '@/lib/supabase/server';
import { listKeywords, listOpenCandidates } from '@/lib/vocabulary/queries';

export const metadata: Metadata = { title: 'Vocabulary' };
export const dynamic = 'force-dynamic';

export default async function VocabularyPage() {
  const [volunteer, keywords, candidates] = await Promise.all([
    getCurrentVolunteer(),
    listKeywords(),
    listOpenCandidates(),
  ]);

  return (
    <VocabularyManager
      keywords={keywords}
      candidates={candidates}
      isAdmin={volunteer?.role === 'admin'}
    />
  );
}
