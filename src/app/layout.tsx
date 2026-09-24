import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import {
  Heebo,
  IBM_Plex_Mono,
  Inter,
  Noto_Naskh_Arabic,
  Noto_Sans_Devanagari,
  Noto_Sans_Malayalam,
} from 'next/font/google';
import { Masthead } from '@/components/masthead';
import { Stats } from '@/components/stats';
import { STATS_COOKIE, readChoice } from '@/lib/stats';
import { currentBucket } from '@/lib/experiment-server';
import { cookies } from 'next/headers';
import { getMessages } from '@/lib/i18n';
import { MessagesProvider } from '@/lib/i18n/provider';
import { ProblemListener } from '@/components/problem-listener';
import './globals.css';

/**
 * One sans per script for everything a person reads, and Plex Mono for
 * anything a machine produced.
 *
 * ── why the serif went ──────────────────────────────────────────────────────
 *
 * Until 21.09.2026 this was Spectral and Frank Ruhl for display against Plex
 * Sans and Assistant for interface. Inon asked for elevenlabs.io's proportions
 * and type, with the archive's own colours. Their system is one sans at every
 * size with weight doing the work: a 48px headline at 300, 16px body at 400,
 * labels at 500. Inter is the open face closest to theirs (their display face,
 * Waldenburg, is licensed), and Heebo is the Hebrew sans drawn to sit with it.
 *
 * ── what did not change ─────────────────────────────────────────────────────
 *
 * Every script the archive holds still gets real faces at real weights. The
 * lesson of 2360a7c stands: a script loaded at one weight has every heading
 * synthesised, and faux bold is what makes type look like a word processor.
 * So each face below carries 300 to 600.
 *
 * They cost nothing on a page that does not use them. next/font emits a
 * `unicode-range` per subset, so a visitor reading English downloads no Hebrew,
 * Devanagari or Malayalam at all.
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

const heebo = Heebo({
  subsets: ['hebrew'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-heebo',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

/** Marathi and Hindi. */
const sansDevanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-devanagari-sans',
  display: 'swap',
});

const sansMalayalam = Noto_Sans_Malayalam({
  subsets: ['malayalam'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-malayalam-sans',
  display: 'swap',
});

/**
 * Judeo-Arabic, which the Baghdadi material is full of.
 *
 * Naskh rather than the sans: naskh is the hand Arabic is *read* in at length,
 * and everything Arabic on this site is quoted source text — a transcription,
 * a title on an object — never interface.
 */
const naskhArabic = Noto_Naskh_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600'],
  variable: '--font-arabic',
  display: 'swap',
});

/**
 * The share card and the page title, in the reader's language.
 *
 * `generateMetadata` runs per request and can read the cookie, so the tab title
 * and the card a link produces in WhatsApp are in the same language as the page
 * — which is the half of "translate the whole site" that is invisible until
 * somebody shares a link.
 */

/**
 * Built per request rather than fixed at build time.
 *
 * The share card's image URL has to be absolute, and the archive's address is
 * not knowable when it is compiled: a Cloudflare tunnel hands out a fresh
 * hostname every restart, and Vercel assigns one on first deploy. Reading it
 * from the request means the card is correct wherever the archive happens to be
 * served from, with nothing to configure.
 *
 * NEXT_PUBLIC_SITE_URL still wins where it is set, for a custom domain that
 * should be canonical no matter which host answered.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { t, language } = await getMessages();
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  let base = configured || 'http://localhost:3000';
  if (!configured) {
    const heads = await headers();
    const host = heads.get('x-forwarded-host') ?? heads.get('host');
    if (host) {
      const protocol = heads.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
      base = `${protocol}://${host}`;
    }
  }

  /*
   * One address per page, and it is the configured one.
   *
   * Every language is the same URL with a different cookie, so there are no
   * per-language addresses to declare — and without a canonical, the preview
   * deployments Vercel mints on each push are separate, indexable copies of the
   * whole archive competing with it in search. Measured 16.09.2026: no page
   * carried one.
   */
  const heads = await headers();
  const path = heads.get('x-pathname') ?? heads.get('x-invoke-path') ?? '/';

  return {
    metadataBase: new URL(base),
    alternates: { canonical: path },
    title: {
      default: t('site.name'),
      template: `%s · ${t('site.name')}`,
    },
    description: t('site.description'),
    openGraph: {
      title: t('site.name'),
      description: t('site.description'),
      siteName: t('site.name'),
      locale: language.code,
      type: 'website',
    },
    twitter: { card: 'summary_large_image' },
    // Only the archive itself belongs in an index. Verification for Search
    // Console is a meta tag the Center pastes into one environment variable.
    verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
      ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
      : undefined,
  };
}

/** The browser chrome takes the archive's own paper. */
export const viewport = {
  themeColor: '#fdfbf7',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
};

/**
 * `lang` and `dir` are set here and nowhere else.
 *
 * `dir="rtl"` on the root is what makes Hebrew work — not a stylesheet. It
 * flips the whole logical box model at once: `ms-`/`me-`, `start`/`end`,
 * text alignment, list markers, scrollbar side. Setting it per component, which
 * is the tempting shortcut, produces a page where half the margins have
 * mirrored and half have not.
 *
 * `lang` matters as much and is easier to forget: it tells a screen reader
 * which voice to read in, and the browser which hyphenation and font fallback
 * to apply. A Hebrew page announced by an English voice is unusable in exactly
 * the way that never shows up in a screenshot.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { t, language, dir, catalogue } = await getMessages();
  const statsChoice = readChoice((await cookies()).get(STATS_COOKIE)?.value);
  const bucket = await currentBucket();

  return (
    <html lang={language.code} dir={dir} className={[
        inter.variable,
        heebo.variable,
        plexMono.variable,
        sansDevanagari.variable,
        sansMalayalam.variable,
        naskhArabic.variable,
      ].join(' ')}>
      <body className="flex min-h-dvh flex-col antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:start-3 focus:z-50 focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:font-medium focus:text-paper focus:shadow-lift"
        >
          {t('site.skipToContent')}
        </a>
        <MessagesProvider catalogue={catalogue}>
          <ProblemListener />
          <Masthead />
          <main id="main" className="flex-1">
            {children}
          </main>
        {/*
          The campaign's blue foot, flush against the bar it closes.
          
          It was the last element of the home page and the footer carried a
          96px top margin, so the two never touched: band, cream, bar. Moving
          it onto the footer makes the join exact by construction rather than
          by two numbers agreeing, and gives every page the same close as the
          poster.
        */}
        <div aria-hidden className="mt-24 h-14 w-full bg-[var(--color-brand-blue)] sm:h-16" />
        <footer className="bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-14">
            <div className="grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
              <div>
                <p className="text-lg font-medium">{t('site.name')}</p>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{t('footer.partner')}</p>
              </div>

              <nav aria-label={t('footer.label')} className="flex flex-col text-sm">
                <Link href="/portal" className="inline-flex min-h-10 items-center text-muted transition-colors hover:text-ink">{t('footer.browse')}</Link>
                <Link href="/upload" className="inline-flex min-h-10 items-center text-muted transition-colors hover:text-ink">{t('footer.contribute')}</Link>
                <Link href="/guides" className="inline-flex min-h-10 items-center text-muted transition-colors hover:text-ink">{t('nav.guides')}</Link>
                <Link href="/handling" className="inline-flex min-h-10 items-center text-muted transition-colors hover:text-ink">{t('footer.handling')}</Link>
              </nav>

              {/* The three a public archive has to publish, at permanent
                  addresses, reachable from every page. */}
              <nav aria-label={t('footer.legal')} className="flex flex-col text-sm">
                <Link href="/privacy" className="inline-flex min-h-10 items-center text-muted transition-colors hover:text-ink">{t('nav.privacy')}</Link>
                <Link href="/terms" className="inline-flex min-h-10 items-center text-muted transition-colors hover:text-ink">{t('nav.terms')}</Link>
                <Link href="/accessibility" className="inline-flex min-h-10 items-center text-muted transition-colors hover:text-ink">{t('nav.accessibility')}</Link>
              </nav>
            </div>

            <p className="mt-12 border-t border-rule pt-6 text-sm leading-relaxed text-muted">
              {t('footer.promise')}
            </p>
            {/* Rafi, 21.09: the Center's notice on the site. The second line
                is not decoration - the terms say copyright in the material
                stays with whoever holds it, and a bare "all rights reserved"
                under every family photograph would say the opposite. */}
            <p className="mt-4 text-sm text-muted">
              {t('footer.copyright')} {t('footer.itemRights')}
            </p>
          </div>
        </footer>
        <Stats
          measurementId={process.env.NEXT_PUBLIC_GA_ID?.trim() || null}
          heatmapId={process.env.NEXT_PUBLIC_CLARITY_ID?.trim() || null}
          initial={statsChoice}
          bucket={bucket}
        />
        </MessagesProvider>
      </body>
    </html>
  );
}
