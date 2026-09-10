import type { Metadata } from 'next';
import { UploadFlow } from '@/components/upload-flow';
import { Logo } from '@/components/logo';
import { getMessages } from '@/lib/i18n';
import { listLanguages, requestedLanguage } from '@/lib/translate/languages';
import { readVocabulary } from '@/lib/vocabulary/load';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getMessages();
  return { title: t('upload.title'), description: t('upload.description') };
}

export default async function UploadPage() {
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
  /*
   * The languages the archive publishes in, for the switch under the scanned
   * text at pre-review.
   *
   * Read here rather than in the flow because `listLanguages` is server-only,
   * and empty on failure rather than fatal: the language switch is an aid, and
   * losing it must not cost somebody the ability to contribute at all.
   */
  const current = await requestedLanguage().catch(() => null);
  const languages = (await listLanguages().catch(() => [])).map((language) => ({
    code: language.code,
    label_en: language.label_en,
    label_native: language.label_native,
    rtl: language.rtl,
  }));
  /*
   * The flow fills the screen instead of sitting in a band at the top.
   *
   * Compacting the three steps worked — and left a 252px void between the last
   * control and the footer on a 1080px screen, which reads as a page that has
   * finished rather than a form waiting for you. The wrapper claims the
   * viewport and centres what is in it, so a short step is composed rather
   * than stranded and a tall one simply flows.
   */
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-var(--masthead-h)-4.5rem)] max-w-[110rem] flex-col justify-center px-6 pt-4 pb-10 sm:px-10 sm:pt-6">
      {/*
        ── the page title is the screen's title ──────────────────────────────
        
        There was a header here: an eyebrow, a 3xl headline and a two-line
        standfirst, 262px of it — above three screens each of which opens with
        its own heading and its own hint saying the same thing in fewer words.
        Measured at 1440x900 it was most of the reason screen two ran 1124px
        past the fold and the button that continues the flow could not be seen
        without scrolling.
        
        The site's name is in the strip at the top of every page. What a person
        needs here is the step they are on, and that is what they get — so the
        page's own title went too: at 1366x768, the laptop most people bring to
        a meeting, it was the last fifty pixels between the analyse button and
        the bottom of the screen.
      */}
      <UploadFlow
        vocabulary={vocabulary}
        languages={languages}
        siteLanguage={current?.code ?? languages[0]?.code ?? 'en'}
        mark={<Logo variant="mark" size={52} />}
      />
    </div>
  );
}
