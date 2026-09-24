import type { Metadata } from 'next';
import { getMessages } from '@/lib/i18n';
import { EmptyState } from '@/components/primitives';
import { listProblems } from '@/lib/items/queries';
import { getCurrentAdmin } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Problems' };
export const dynamic = 'force-dynamic';

/**
 * The problem log (0031): what failed, where, and when.
 *
 * A report in the bug sheet that quotes a code like E-7KQ2WX is looked up
 * here. Administrators only — the render check below, the manage layout and
 * the proxy in front of it, and RLS under it.
 */
export default async function ProblemsPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { t } = await getMessages();
  const admin = await getCurrentAdmin();
  if (!admin) {
    return (
      <EmptyState
        title={t('manage.administratorsOnly')}
        body={t('problems.adminsOnly')}
        action={{ href: '/manage/vocabulary', label: 'Back to the vocabulary' }}
      />
    );
  }

  const { code } = await searchParams;
  const problems = await listProblems(code);

  return (
    <section>
      <p className="max-w-2xl leading-relaxed text-muted">{t('problems.intro')}</p>
      <form className="mt-6 flex flex-wrap gap-2.5" action="/manage/problems">
        <input
          name="code"
          defaultValue={code ?? ''}
          placeholder="E-7KQ2WX"
          dir="ltr"
          className="h-11 w-48 rounded-full border border-rule bg-paper px-4 font-mono"
          aria-label={t('problems.find')}
        />
        <button className="h-11 rounded-full bg-primary px-5 font-medium text-white hover:bg-primary-strong">
          {t('problems.find')}
        </button>
      </form>

      {problems.length === 0 ? (
        <p className="mt-8 text-muted">{code ? t('problems.notFound') : t('problems.none')}</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {problems.map((p) => (
            <li key={p.code} className="card p-4">
              <details>
                <summary className="cursor-pointer">
                  <span className="font-mono font-medium" dir="ltr">{p.code}</span>
                  <span className="ms-3 text-sm text-muted" dir="ltr">
                    {new Date(p.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem' })} · {p.source}
                    {p.place ? ` · ${p.place}` : ''}
                    {p.path ? ` · ${p.path}` : ''}
                  </span>
                  <span className="mt-1 block break-words" dir="ltr">{p.message}</span>
                </summary>
                {(p.detail || p.user_agent) && (
                  <pre className="machine mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-muted" dir="ltr">
                    {[p.detail, p.user_agent].filter(Boolean).join('\n\n')}
                  </pre>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
