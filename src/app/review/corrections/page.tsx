import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentVolunteer } from '@/lib/supabase/server';
import { readRecordCorrections } from '@/lib/items/queries';
import { getMessages } from '@/lib/i18n';
import { CorrectionDecision } from '@/components/correction-decision';
import { fieldDef } from '@/lib/fields/registry';
import { fieldLabel } from '@/lib/fields/labels';
import { buttonClass } from '@/components/primitives';

export default async function CorrectionsPage() {
  if (!await getCurrentVolunteer()) redirect('/login');
  const { t, language } = await getMessages();
  const corrections = await readRecordCorrections();
  return <main className="mx-auto max-w-4xl px-6 py-10">
    <h1 className="font-display text-3xl">{t('public.corrections')}</h1>
    {!corrections.length && <p className="mt-6">{t('public.noCorrections')}</p>}
    <div className="mt-6 space-y-8">
      {corrections.map(correction => <article key={correction.id} className="card min-w-0 p-5 sm:p-7">
        <h2 dir="auto" className="mb-3 break-words font-display text-2xl">{correction.record_title || t('record.notFound')}</h2>
        <p className="flex flex-wrap gap-3"><strong>{correction.anonymous ? t('public.anonymous') : correction.proposer_name}</strong>
          <time dateTime={correction.created_at}>{new Date(correction.created_at).toLocaleDateString(language.code)}</time></p>
        <Link href={`/portal/${correction.item_id}`} className={buttonClass('quiet', 'my-4')}>{t('public.view')}</Link>
        {correction.objection_at && <aside className="mb-5 border-s-4 border-caution bg-accent-wash p-4">
          <strong>{t('public.objection')}</strong><p dir="auto" className="mt-2 whitespace-pre-wrap break-words">{correction.objection_note}</p>
        </aside>}
        <dl className="space-y-5">
          {Object.entries(correction.changes).map(([key, change]) => {
            const def = key.startsWith('field:') ? fieldDef(key.slice(6)) : null;
            const label = def ? fieldLabel(t, def) : key === 'title' ? t('public.title') : key === 'description' ? t('public.description')
              : key === 'period' ? t('record.period') : t('record.placeOfOrigin');
            return <div key={key}>
              <dt className="mb-2 font-medium">{label}</dt>
              <dd className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="min-w-0 rounded-lg border border-rule p-3"><span className="text-sm text-muted">{t('public.from')}</span><p dir="auto" className="whitespace-pre-wrap break-words">{change.from || t('public.none')}</p></div>
                <div className="min-w-0 rounded-lg border border-rule bg-accent-wash p-3"><span className="text-sm text-muted">{t('public.to')}</span><p dir="auto" className="whitespace-pre-wrap break-words">{change.to || t('public.none')}</p></div>
              </dd>
            </div>;
          })}
        </dl>
        {correction.note && <p dir="auto" className="mt-4 whitespace-pre-wrap break-words">{correction.note}</p>}
        <CorrectionDecision id={correction.id} objectionAt={correction.objection_at} />
      </article>)}
    </div>
  </main>;
}
