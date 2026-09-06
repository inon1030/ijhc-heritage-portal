import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import {
  Assistant,
  Frank_Ruhl_Libre,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Noto_Naskh_Arabic,
  Noto_Sans_Devanagari,
  Noto_Sans_Malayalam,
  Noto_Serif_Devanagari,
  Noto_Serif_Malayalam,
  Spectral,
} from 'next/font/google';
import { Masthead } from '@/components/masthead';
import { getMessages } from '@/lib/i18n';
import { MessagesProvider } from '@/lib/i18n/provider';
import './globals.css';

/**
 * Spectral for display, Plex Sans for interface, Plex Mono for anything a
 * machine produced.
 *
 * ── the four below, and why they are not optional ───────────────────────────
 *
 * The comment that used to sit here said Spectral carries "the language
 * coverage an archive of Hebrew, Marathi, Malayalam and English material
 * needs". It does not, and never did — it is loaded `subsets: ['latin']` and
 * Spectral has no Hebrew, Devanagari or Malayalam glyphs at all. Every Hebrew
 * transcription the model returns has been rendering in whatever the browser
 * happened to fall back to, which on a machine without a Hebrew face is tofu.
 *
 * The archive stores what is written on the object, in the script it was
 * written in — the AI prompt says so in as many words. So the faces for those
 * scripts belong here beside the Latin ones.
 *
 * **They cost nothing on a page that does not use them.** next/font emits a
 * `unicode-range` per subset, so a browser downloads the Hebrew face only when
 * Hebrew characters are actually on the page. A visitor reading English
 * records fetches none of the four.
 */
const spectral = Spectral({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-spectral',
  display: 'swap',
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

/**
 * ── the other four scripts, and why they needed rebuilding ──────────────────
 *
 * They used to be one face at one weight each: Noto Sans, 400, for every
 * script the archive is not written in. Measured on the deployed Hebrew page,
 * that produced two faults that do not exist in English.
 *
 * **No hierarchy.** `--font-display` resolved Spectral → *Spectral has no
 * Hebrew* → Noto Sans Hebrew. `--font-sans` resolved Plex Sans → *no Hebrew* →
 * Noto Sans Hebrew. Headline and body came out as the same face. The whole
 * design rests on a serif display against a sans interface, and in four of the
 * five languages that distinction simply did not exist.
 *
 * **No bold.** `document.fonts.check('500 45px "Noto Sans Hebrew"')` returned
 * false: only 400 was loaded, so every heading weight was **synthesised** — the
 * browser smearing a regular to fake a medium. Faux bold is the single thing
 * that most makes type look like a word processor rather than a design.
 *
 * So each script now gets what Latin gets: a serif for display, a sans for
 * interface, and the same three real weights. Chosen per script rather than
 * taken from one family, because a heritage archive is the wrong place for the
 * face whose entire design brief was "neutral fallback".
 *
 * They still cost nothing on a page that does not use them. next/font emits a
 * `unicode-range` per subset, so a visitor reading English downloads none of
 * these — which is what makes it affordable to load eight faces instead of four.
 */

/**
 * Hebrew display. Frank Ruhl, cut in 1908, is *the* Hebrew book face — the one
 * designed to sit beside a Latin literary serif on a scholarly page, which is
 * exactly what Spectral is doing on the other side of this archive.
 */
const frankRuhl = Frank_Ruhl_Libre({
  subsets: ['hebrew'],
  weight: ['400', '500', '600'],
  variable: '--font-hebrew-display',
  display: 'swap',
});

/** Hebrew interface. A warm humanist sans, and legible small. */
const assistant = Assistant({
  subsets: ['hebrew'],
  weight: ['400', '500', '600'],
  variable: '--font-hebrew-sans',
  display: 'swap',
});

/** Marathi and Hindi. */
const serifDevanagari = Noto_Serif_Devanagari({
  subsets: ['devanagari'],
  weight: ['400', '500', '600'],
  variable: '--font-devanagari-display',
  display: 'swap',
});

const sansDevanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  weight: ['400', '500', '600'],
  variable: '--font-devanagari-sans',
  display: 'swap',
});

const serifMalayalam = Noto_Serif_Malayalam({
  subsets: ['malayalam'],
  weight: ['400', '500', '600'],
  variable: '--font-malayalam-display',
  display: 'swap',
});

const sansMalayalam = Noto_Sans_Malayalam({
  subsets: ['malayalam'],
  weight: ['400', '500', '600'],
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

  return {
    metadataBase: new URL(base),
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
  };
}

/** The browser chrome on a phone takes the archive's own paper. */
export const viewport = {
  themeColor: '#fdfbf7',
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

  return (
    <html lang={language.code} dir={dir} className={[
        spectral.variable,
        plexSans.variable,
        plexMono.variable,
        frankRuhl.variable,
        assistant.variable,
        serifDevanagari.variable,
        sansDevanagari.variable,
        serifMalayalam.variable,
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
          <Masthead />
          <main id="main" className="flex-1">
            {children}
          </main>
        <footer className="mt-24 border-t border-rule bg-paper-2/70">
          <div className="mx-auto max-w-6xl px-6 py-12">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-display text-xl">{t('site.name')}</p>
                <p className="mt-1 text-muted">{t('footer.partner')}</p>
              </div>

              <nav aria-label={t('footer.label')} className="flex flex-col sm:items-end">
                <Link href="/portal" className="inline-flex min-h-11 items-center text-muted transition-colors hover:text-accent">
                  {t('footer.browse')}
                </Link>
                <Link href="/upload" className="inline-flex min-h-11 items-center text-muted transition-colors hover:text-accent">
                  {t('footer.contribute')}
                </Link>
                <Link href="/handling" className="inline-flex min-h-11 items-center text-muted transition-colors hover:text-accent">
                  {t('footer.handling')}
                </Link>
              </nav>
            </div>

            <p className="mt-10 border-t border-rule pt-6 text-sm leading-relaxed text-muted">
              {t('footer.promise')}
            </p>
          </div>
        </footer>
        </MessagesProvider>
      </body>
    </html>
  );
}
