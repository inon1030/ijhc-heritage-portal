import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { PRIVACY } from '@/lib/legal';
import { getMessages } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const { language } = await getMessages();
  const written = language.code === 'he' ? 'he' : 'en';
  return { title: PRIVACY[written].title, description: PRIVACY[written].standfirst };
}

export default function PrivacyPage() {
  return <LegalPage documents={PRIVACY} />;
}
