import Link from 'next/link';
import { emptyCommunityCounts } from '@/lib/communities';
import { Logo, hasSuppliedLogo } from '@/components/logo';
import { LanguagePicker } from '@/components/language-picker';
import { MastheadShell } from '@/components/masthead-shell';
import { SiteNav } from '@/components/site-nav';
import { StreamRule } from '@/components/stream-rule';
import { countReviewQueue, getCommunityCounts } from '@/lib/items/queries';
import { getCurrentProfile } from '@/lib/supabase/server';
import { listLanguages, requestedLanguage } from '@/lib/translate/languages';
import { getMessages } from '@/lib/i18n';

/**
 * The masthead, folded away behind a strip. `MastheadShell` handles the
 * opening; everything here is what appears once it has.
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
          className="flex items-center gap-2.5 rounded-lg transition-opacity duration-200 hover:opacity-70"
        >
          <Logo variant="mark" size={22} />
          <span className="wordmark hidden text-[0.95rem] sm:inline">{t('site.name')}</span>
          <span className="wordmark text-base sm:hidden">{t('site.short')}</span>
        </Link>
      }
      rule={<StreamRule counts={counts} />}
      language={
        <LanguagePicker languages={languages} current={reading?.code ?? languages[0]?.code ?? 'en'} />
      }
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-5 md:flex-row md:items-start md:gap-8">
        <Link
          href="/"
          className="group flex items-center gap-3 self-start rounded-xl transition-transform duration-300 hover:-translate-y-0.5 md:pt-1"
        >
          {hasSuppliedLogo ? (
            <>
              {/* The lockup carries the name inside the artwork, so the name is
                  set only for screen readers. */}
              <Logo variant="lockup" size={58} />
              <span className="sr-only">{t('site.home')}</span>
              <span className="hidden border-l border-rule pl-4 lg:block">
                <span className="wordmark block text-lg leading-tight">{t('site.name')}</span>
                <span className="eyebrow block">{t('masthead.fourStreams')}</span>
              </span>
            </>
          ) : (
            <>
              <Logo
                size={40}
                className="text-turquoise transition-colors group-hover:text-accent-strong"
              />
              <span>
                <span className="wordmark block text-[1.35rem] leading-tight">{t('site.name')}</span>
                <span className="eyebrow block">{t('masthead.digitalArchive')}</span>
              </span>
            </>
          )}
        </Link>

        <SiteNav profile={profile} queueCount={queueCount} />
      </div>
    </MastheadShell>
  );
}
