import Link from 'next/link';
import type { Metadata } from 'next';
import { FileText, Lock, LogIn, PlayCircle } from 'lucide-react';
import { getMessages } from '@/lib/i18n';
import { getCurrentProfile } from '@/lib/supabase/server';
import {
  AUDIENCES,
  GUIDE_FILES,
  SCANNING_VIDEO,
  canOpen,
  guideLanguage,
  type Audience,
  type GuideFile,
} from '@/lib/guides/catalogue';
import { walkthrough } from '@/lib/guides/steps';
import { Walkthrough } from '@/components/walkthrough';
import type { MessageKey } from '@/lib/i18n/messages';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getMessages();
  return { title: t('guides.title'), description: t('guides.standfirst') };
}

/**
 * The guides, behind the book in the top bar.
 *
 * One page, three sections, and the reader sees only what their account opens:
 * the contributor guide for everyone, the knowledge-expert guide for an
 * approved account, the administrator guide for an administrator. A section the
 * reader may not open is not rendered - they get one line saying who it is for
 * - and `/api/guides/...` refuses the files on its own, so the page is a
 * courtesy and not the lock.
 *
 * Each section has the same three things, in the order a person reaches for
 * them: the walkthrough to click through now, the full guide as a PDF to keep,
 * and the video.
 */

const HEADING: Record<Audience, MessageKey> = {
  contributor: 'guides.contributor.heading',
  expert: 'guides.expert.heading',
  admin: 'guides.admin.heading',
};
const INTRO: Record<Audience, MessageKey> = {
  contributor: 'guides.contributor.intro',
  expert: 'guides.expert.intro',
  admin: 'guides.admin.intro',
};
const LOCKED: Record<Audience, MessageKey> = {
  contributor: 'guides.contributor.intro',
  expert: 'guides.expert.locked',
  admin: 'guides.admin.locked',
};

export default async function GuidesPage() {
  const [{ t, language }, profile] = await Promise.all([getMessages(), getCurrentProfile().catch(() => null)]);
  const lang = guideLanguage(language.code);

  return (
    <div className="mx-auto max-w-6xl px-6 pb-8 pt-12 sm:pt-16">
      <header className="max-w-3xl">
        <p className="eyebrow">{t('guides.eyebrow')}</p>
        <h1 className="mt-3 text-4xl leading-[1.08] sm:text-5xl">{t('guides.title')}</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">{t('guides.standfirst')}</p>
      </header>

      <nav aria-label={t('guides.sections')} className="mt-8 flex flex-wrap gap-2">
        {AUDIENCES.map((audience) => (
          <a
            key={audience}
            href={`#${audience}`}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-rule-strong px-4 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            {!canOpen(audience, profile?.role) && <Lock size={14} aria-hidden />}
            {t(HEADING[audience])}
          </a>
        ))}
      </nav>

      <div className="mt-14 flex flex-col gap-20">
        {AUDIENCES.map((audience) =>
          canOpen(audience, profile?.role) ? (
            <GuideSection key={audience} audience={audience} lang={lang} t={t} />
          ) : (
            <section key={audience} id={audience} className="scroll-mt-28">
              <h2 className="text-3xl sm:text-[2rem]">{t(HEADING[audience])}</h2>
              <div className="mt-5 flex flex-col items-start gap-4 rounded-[var(--radius-card)] bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-3 text-muted">
                  <Lock size={18} aria-hidden className="shrink-0" />
                  {t(LOCKED[audience])}
                </p>
                {!profile && (
                  <Link
                    href="/login?next=/guides"
                    className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 font-medium text-white transition-colors hover:bg-primary-strong"
                  >
                    <LogIn size={17} aria-hidden />
                    {t('nav.signIn')}
                  </Link>
                )}
              </div>
            </section>
          ),
        )}
      </div>
    </div>
  );
}

type T = Awaited<ReturnType<typeof getMessages>>['t'];

function GuideSection({ audience, lang, t }: { audience: Audience; lang: 'he' | 'en'; t: T }) {
  const steps = walkthrough(audience, lang);
  const files = GUIDE_FILES.filter((f) => f.audience === audience);
  const pdfs = files.filter((f) => f.kind === 'pdf');
  // The reader's own language first; the other one is still there.
  const videos = files
    .filter((f) => f.kind === 'video')
    .sort((a, b) => Number(b.language === lang) - Number(a.language === lang));

  return (
    <section id={audience} className="scroll-mt-28">
      <h2 className="text-3xl sm:text-[2rem]">{t(HEADING[audience])}</h2>
      <p className="mt-3 max-w-3xl leading-relaxed text-muted">{t(INTRO[audience])}</p>

      {steps.length > 0 && (
        <div className="mt-8">
          <Walkthrough steps={steps} label={t(HEADING[audience])} />
        </div>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_2fr]">
        <div>
          <h3 className="text-lg">{t('guides.fullGuide')}</h3>
          <p className="mt-1 text-sm text-muted">{t('guides.fullGuideHint')}</p>
          <ul className="mt-4 flex flex-col gap-2">
            {pdfs.map((file) => (
              <li key={file.path}>
                <FileLink file={file} t={t} />
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-lg">{t('guides.videos')}</h3>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {videos.map((file) => (
              <figure key={file.path} className="m-0">
                <video
                  controls
                  preload="none"
                  src={`/api/guides/${file.path}`}
                  poster={`/guides/posters/${file.path.replace('video/', '').replace('.mp4', '.png')}`}
                  className="aspect-video w-full rounded-2xl bg-surface-2"
                  data-full
                />
                <figcaption className="mt-2 flex items-center gap-2 text-sm text-muted">
                  <PlayCircle size={15} aria-hidden />
                  {file.language === 'he' ? 'עברית' : 'English'}
                  {file.duration && <span className="font-mono text-xs">{file.duration}</span>}
                </figcaption>
              </figure>
            ))}

            {audience === 'contributor' && (
              <figure className="m-0 sm:col-span-2">
                <iframe
                  src={`https://drive.google.com/file/d/${SCANNING_VIDEO.driveId}/preview`}
                  title={t('guides.scanning')}
                  allow="autoplay; fullscreen"
                  loading="lazy"
                  className="aspect-video w-full rounded-2xl border-0 bg-surface-2"
                />
                <figcaption className="mt-2 text-sm text-muted">
                  <span className="font-medium text-ink">{t('guides.scanning')}</span> · {t('guides.scanningHint')}
                </figcaption>
              </figure>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function FileLink({ file, t }: { file: GuideFile; t: T }) {
  return (
    <a
      href={`/api/guides/${file.path}`}
      target="_blank"
      rel="noopener"
      className="card card-interactive flex items-center gap-3 px-4 py-3"
    >
      <FileText size={20} aria-hidden className="shrink-0 text-accent-strong" />
      <span className="flex flex-col">
        <span className="font-medium">{file.language === 'he' ? t('guides.pdfHebrew') : t('guides.pdfEnglish')}</span>
        {file.megabytes > 0 && <span className="font-mono text-xs text-muted">PDF · {file.megabytes} MB</span>}
      </span>
    </a>
  );
}
