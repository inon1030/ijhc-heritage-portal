import { Suspense } from 'react';
import { getMessages } from '@/lib/i18n';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/login-form';

export const metadata: Metadata = {
  title: 'Volunteer access',
};

export default async function LoginPage() {
  const { t } = await getMessages();
  return (
    <div className="animate-rise mx-auto max-w-md px-6 py-20">
      <h1 className="font-display text-3xl leading-tight sm:text-4xl">{t('manage.volunteerAccess')}</h1>
      <p className="mt-3 leading-relaxed text-muted">
        Reviewing submissions needs an account. Browsing and contributing do not — those are open to
        everyone.
      </p>
      <Suspense fallback={<div className="mt-8 h-56" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
