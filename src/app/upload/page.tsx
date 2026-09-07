import type { Metadata } from 'next';
import { UploadFlow } from '@/components/upload-flow';
import { getMessages } from '@/lib/i18n';
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
  return (
    <div className="mx-auto max-w-3xl px-6 pt-4 pb-14 sm:pt-5 sm:pb-16">
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
      <UploadFlow vocabulary={vocabulary} />
    </div>
  );
}
