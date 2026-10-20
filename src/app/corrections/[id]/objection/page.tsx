import type { Metadata } from 'next';
import { z } from 'zod';
import { getMessages } from '@/lib/i18n';
import { verifyPublicToken } from '@/lib/items/public-tokens';
import { CorrectionObjection } from '@/components/correction-objection';
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function ObjectionPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t: token } = await searchParams;
  const { t } = await getMessages();
  const valid = z.uuid().safeParse(id).success && typeof token === 'string' && verifyPublicToken('objection', id, token);
  return <main className="mx-auto max-w-2xl px-6 py-10">
    <h1 className="font-display text-3xl">{t('public.object')}</h1>
    {valid ? <CorrectionObjection id={id} token={token!} /> : <p className="mt-6">{t('public.expired')}</p>}
  </main>;
}
