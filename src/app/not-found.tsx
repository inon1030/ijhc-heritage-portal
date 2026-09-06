import Link from 'next/link';
import { getMessages } from '@/lib/i18n';

export default async function NotFound() {
  const { t } = await getMessages();
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 font-display text-3xl">{t('notfound.title')}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        {t('notfound.withdrawn')}
      </p>
      <Link
        href="/portal"
        className="mt-8 inline-block bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:bg-ink-2"
      >
        {t('common.backToPortal')}
      </Link>
    </div>
  );
}
