import Link from 'next/link';
import { emptyCommunityCounts } from '@/lib/communities';
import { Logo } from '@/components/logo';
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
          <Logo variant="mark" size={36} />
          <span className="wordmark hidden text-[1.22rem] sm:inline">{t('site.name')}</span>
          <span className="wordmark text-xl sm:hidden">{t('site.short')}</span>
        </Link>
      }
      rule={<StreamRule counts={counts} />}
      language={
        <LanguagePicker
          languages={languages}
          current={reading?.code ?? languages[0]?.code ?? 'en'}
          /* A knowledge expert changes the language *in order to* review in it.
             Everyone else is a contributor with unsaved files on the page. */
          exempt={approved}
        />
      }
    >
      {/*
        No mark in the open bar.

        There was a 68px lockup here and the strip above it already carries the
        Center's mark and its name, as a link home — so opening the menu drew
        the same logo twice, sixteen pixels apart, and the navigation started
        two hundred pixels in from the left to make room for the second one.

        What the bar is *for* is the navigation. The way home is the strip, and
        it is there whether the bar is open or shut.
      */}
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-5 md:flex-row md:items-center md:gap-8">
        <SiteNav profile={profile} queueCount={queueCount} />
      </div>
    </MastheadShell>
  );
}
