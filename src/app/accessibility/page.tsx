import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { ACCESSIBILITY } from '@/lib/legal';
import { getMessages } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const { language } = await getMessages();
  const written = language.code === 'he' ? 'he' : 'en';
  return { title: ACCESSIBILITY[written].title, description: ACCESSIBILITY[written].standfirst };
}

export default function AccessibilityPage() {
  return <LegalPage documents={ACCESSIBILITY} officer />;
}
