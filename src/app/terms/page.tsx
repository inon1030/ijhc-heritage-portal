import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { TERMS } from '@/lib/legal';
import { getMessages } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const { language } = await getMessages();
  const written = language.code === 'he' ? 'he' : 'en';
  return { title: TERMS[written].title, description: TERMS[written].standfirst };
}

export default function TermsPage() {
  return <LegalPage documents={TERMS} />;
}
