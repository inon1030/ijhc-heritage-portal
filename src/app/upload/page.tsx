import type { Metadata } from 'next';
import { UploadFlow } from '@/components/upload-flow';
import { getMessages } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getMessages();
  return { title: t('upload.title'), description: t('upload.description') };
}

export default async function UploadPage() {
  const { t } = await getMessages();
  return (
    <div className="mx-auto max-w-3xl px-6 pt-8 pb-14 sm:pt-12 sm:pb-16">
      <header className="mb-10 max-w-xl sm:mb-12">
        <p className="eyebrow animate-rise">{t('upload.eyebrow')}</p>
        <h1 className="animate-rise mt-3 font-display text-3xl leading-tight sm:text-5xl">
          {t('upload.headline')}
        </h1>
        <p
          className="animate-rise mt-4 leading-relaxed text-muted sm:text-lg"
          style={{ '--reveal-delay': '90ms' } as React.CSSProperties}
        >
          {t('upload.standfirst')}
        </p>
      </header>
      <UploadFlow />
    </div>
  );
}
