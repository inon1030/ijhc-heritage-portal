import Link from 'next/link';
import { emptyCommunityCounts } from '@/lib/communities';
import { Logo } from '@/components/logo';
import { LanguagePicker } from '@/components/language-picker';
import { MastheadShell } from '@/components/masthead-shell';
import { StreamRule } from '@/components/stream-rule';
import { countReviewQueue, getCommunityCounts } from '@/lib/items/queries';
import { getCurrentProfile } from '@/lib/supabase/server';
import { listLanguages, requestedLanguage } from '@/lib/translate/languages';
import { getMessages } from '@/lib/i18n';

/**
 * The masthead. `MastheadShell` lays it out; this gathers what it shows.
 *
 * It sits on paper rather than a dark band. The Center's mark is a blue star
 * around a saffron chakra: on a coloured ground it reads as a sticker on
 * someone else's page, and on cream it is simply the Center's.
 */
export async function Masthead() {
  // Renders above every route, including the sign-in page, so it must survive
  // the database being unreachable or not yet configured.
  const [profile, counts, languages, reading, m] = await Promise.all([
    getCurrentProfile().catch(() => null),
    getCommunityCounts().catch(emptyCommunityCounts),
    listLanguages().catch(() => []),
    requestedLanguage().catch(() => null),
    getMessages(),
  ]);
  const { t } = m;

  // A pending account has a profile and no rights. Counting its queue would
  // return zero anyway — RLS sees to that — but asking at all would imply it
  // has one.
  const approved = profile?.role === 'volunteer' || profile?.role === 'admin';
  const queueCount = approved ? await countReviewQueue().catch(() => 0) : 0;

  return (
    <MastheadShell
      home={
        <Link
          href="/"
          aria-label={t('site.home')}
          className="flex items-center gap-2.5 rounded-lg transition-opacity duration-200 hover:opacity-75"
        >
          <Logo variant="mark" size={34} />
          <span className="wordmark hidden text-[1.05rem] xl:inline">{t('site.name')}</span>
          <span className="wordmark text-lg xl:hidden">{t('site.short')}</span>
        </Link>
      }
      rule={<StreamRule counts={counts} />}
      language={
        <div className="flex items-center gap-1.5">
          <LanguagePicker
            languages={languages}
            current={reading?.code ?? languages[0]?.code ?? 'en'}
            /* A knowledge expert changes the language *in order to* review in it.
               Everyone else is a contributor with unsaved files on the page. */
            exempt={approved}
          />
        </div>
      }
      profile={profile}
      queueCount={queueCount}
    />
  );
}
