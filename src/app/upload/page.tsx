import type { Metadata } from 'next';
import { UploadFlow } from '@/components/upload-flow';
import { getMessages } from '@/lib/i18n';
import { readVocabulary } from '@/lib/vocabulary/load';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getMessages();
  return { title: t('upload.title'), description: t('upload.description') };
}

export default async function UploadPage() {
  const { t } = await getMessages();
  /*
   * The archive's own tag list, read on the server and handed down.
   *
   * `keywords` is public to read, so a contributor sees exactly the terms a
   * volunteer would — which is the point: a tag they pick is a tag the archive
   * already uses, not a fifth spelling of Bombay for somebody to merge later.
   */
  const vocabulary = (await readVocabulary().catch(() => [])).map((term) => ({
    term: term.term,
    variants: term.variants,
  }));
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
      <UploadFlow vocabulary={vocabulary} />
    </div>
  );
}
