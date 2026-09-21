import Link from 'next/link';
import type { Metadata } from 'next';
import { BookOpen, FileText, Lock, LogIn, Zap } from 'lucide-react';
import { getMessages } from '@/lib/i18n';
import { getCurrentProfile } from '@/lib/supabase/server';
import {
  AUDIENCES,
  GUIDE_FILES,
  canOpen,
  depthOf,
  guideLanguage,
  type Audience,
  type Depth,
  type GuideFile,
} from '@/lib/guides/catalogue';
import { walkthrough } from '@/lib/guides/steps';
import { Walkthrough } from '@/components/walkthrough';
import { PlayableVideo } from '@/components/playable-video';
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
 * At the top, the choice Inon asked for on 21.09.2026: quick learning or in
 * depth. It is a link (`?mode=deep`), not a client toggle, so it survives a
 * refresh, can be sent to someone, and needs no JavaScript. Quick shows the few
 * steps that get the job done and a one-page PDF; in depth shows every step and
 * the full guide. The videos are in both.
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

type T = Awaited<ReturnType<typeof getMessages>>['t'];

export default async function GuidesPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const [{ t, language }, profile, params] = await Promise.all([
    getMessages(),
    getCurrentProfile().catch(() => null),
    searchParams,
  ]);
  const lang = guideLanguage(language.code);
  const depth = depthOf(params.mode);

  return (
    <div className="mx-auto max-w-6xl px-6 pb-8 pt-12 sm:pt-16">
      <header className="max-w-3xl">
        <p className="eyebrow">{t('guides.eyebrow')}</p>
        <h1 className="mt-3 text-4xl leading-[1.08] sm:text-5xl">{t('guides.title')}</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">{t('guides.standfirst')}</p>
      </header>

      <ModeSwitch depth={depth} t={t} />

      <nav aria-label={t('guides.sections')} className="mt-6 flex flex-wrap gap-2">
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
            <GuideSection key={audience} audience={audience} lang={lang} depth={depth} t={t} />
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

/**
 * Two large choices side by side, the current one filled. Big enough to read
 * as the first decision on the page, not a filter tucked into a corner.
 */
function ModeSwitch({ depth, t }: { depth: Depth; t: T }) {
  const options = [
    { value: 'quick' as const, icon: Zap, title: t('guides.mode.quick'), hint: t('guides.mode.quickHint') },
    { value: 'deep' as const, icon: BookOpen, title: t('guides.mode.deep'), hint: t('guides.mode.deepHint') },
  ];
  return (
    <nav aria-label={t('guides.mode.label')} className="mt-10 grid gap-2 rounded-[1.75rem] bg-surface p-2 sm:grid-cols-2">
      {options.map(({ value, icon: Icon, title, hint }) => {
        const current = value === depth;
        return (
          <Link
            key={value}
            href={value === 'quick' ? '/guides' : '/guides?mode=deep'}
            scroll={false}
            aria-current={current ? 'page' : undefined}
            className={[
              'flex items-center gap-4 rounded-[1.4rem] px-5 py-4 transition-colors duration-200',
              current ? 'bg-paper shadow-soft ring-2 ring-primary' : 'text-muted hover:bg-surface-2',
            ].join(' ')}
          >
            <span
              className={[
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-full',
                current ? 'bg-primary text-white' : 'bg-surface-2 text-muted',
              ].join(' ')}
            >
              <Icon size={22} aria-hidden />
            </span>
            <span className="flex flex-col">
              <span className={['text-lg font-medium', current ? 'text-ink' : ''].join(' ')}>{title}</span>
              <span className="text-sm">{hint}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function GuideSection({ audience, lang, depth, t }: { audience: Audience; lang: 'he' | 'en'; depth: Depth; t: T }) {
  const steps = walkthrough(audience, lang, depth);
  const files = GUIDE_FILES.filter((f) => f.audience === audience);
  const pdfs = files.filter((f) => f.kind === 'pdf' && f.depth === depth);
  // The reader's own language first; the other one is still there.
  const videos = files
    .filter((f) => f.kind === 'video' && (!f.depth || f.depth === depth))
    .sort((a, b) => Number(b.language === lang) - Number(a.language === lang));

  return (
    <section id={audience} className="scroll-mt-28">
      <h2 className="text-3xl sm:text-[2rem]">{t(HEADING[audience])}</h2>
      <p className="mt-3 max-w-3xl leading-relaxed text-muted">{t(INTRO[audience])}</p>

      {steps.length > 0 && (
        <div className="mt-8">
          <Walkthrough key={depth} steps={steps} label={t(HEADING[audience])} />
        </div>
      )}

      <div className="mt-10">
        <h3 className="text-xl">{t('guides.videos')}</h3>
        <ul className="mt-4 grid gap-6 sm:grid-cols-2">
          {videos.map((file) => (
            <li key={file.path}>
              <VideoCard file={file} />
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-10">
        <h3 className="text-xl">{depth === 'quick' ? t('guides.quickGuide') : t('guides.fullGuide')}</h3>
        <p className="mt-1 text-sm text-muted">{depth === 'quick' ? t('guides.quickGuideHint') : t('guides.fullGuideHint')}</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {pdfs.map((file) => (
            <li key={file.path}>
              <FileLink file={file} t={t} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * A video as an item in the archive: a large card, the picture first, a round
 * play button in its middle, and the title under it.
 */
function VideoCard({ file }: { file: GuideFile }) {
  const poster = `/guides/posters/${file.path.replace('video/', '').replace('-short', '').replace('.mp4', '.png')}`;
  return (
    <article className="card overflow-hidden">
      <div className="aspect-video">
        <PlayableVideo src={`/api/guides/${file.path}`} poster={poster} label={file.title ?? ''} />
      </div>
      <div className="px-5 py-4" dir={file.language === 'he' ? 'rtl' : 'ltr'} lang={file.language}>
        <h4 className="text-lg font-medium leading-snug">{file.title}</h4>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
          <span>{file.language === 'he' ? 'עברית' : 'English'}</span>
          {file.duration && <span className="font-mono text-xs">· {file.duration}</span>}
          {file.credit && (
            <span className="font-mono text-xs">
              · <bdi dir="ltr">{file.credit}</bdi>
            </span>
          )}
        </p>
      </div>
    </article>
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
