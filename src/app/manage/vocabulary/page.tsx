import type { Metadata } from 'next';
import { VocabularyManager } from '@/components/vocabulary-manager';
import { getCurrentVolunteer } from '@/lib/supabase/server';
import { listOpenCandidates } from '@/lib/vocabulary/queries';
import { readVocabulary } from '@/lib/vocabulary/load';

export const metadata: Metadata = { title: 'Vocabulary' };
export const dynamic = 'force-dynamic';

export default async function VocabularyPage() {
  const [volunteer, terms, candidates] = await Promise.all([
    getCurrentVolunteer(),
    readVocabulary(),
    listOpenCandidates(),
  ]);

  return (
    <VocabularyManager
      terms={terms}
      candidates={candidates}
      isAdmin={volunteer?.role === 'admin'}
    />
  );
}
