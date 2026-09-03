import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import {
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Noto_Sans_Arabic,
  Noto_Sans_Devanagari,
  Noto_Sans_Hebrew,
  Noto_Sans_Malayalam,
  Spectral,
} from 'next/font/google';
import { Masthead } from '@/components/masthead';
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

/*
 * One weight each. These render transcriptions and place names, not headlines,
 * and a second weight would double a download most visitors never make.
 */
const notoHebrew = Noto_Sans_Hebrew({
  subsets: ['hebrew'],
  weight: ['400'],
  variable: '--font-hebrew',
  display: 'swap',
});

/** Marathi and Hindi. */
const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  weight: ['400'],
  variable: '--font-devanagari',
  display: 'swap',
});

const notoMalayalam = Noto_Sans_Malayalam({
  subsets: ['malayalam'],
  weight: ['400'],
  variable: '--font-malayalam',
  display: 'swap',
});

/** Judeo-Arabic, which the Baghdadi material is full of. */
const notoArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400'],
  variable: '--font-arabic',
  display: 'swap',
});

const DESCRIPTION =
  'A digital archive of the Bene Israel, Cochin, Baghdadi and Bnei Menashe communities. Four streams, one river.';

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
      default: 'Indian Jewish Heritage Center',
      template: '%s · Indian Jewish Heritage Center',
    },
    description: DESCRIPTION,
    openGraph: {
      title: 'Indian Jewish Heritage Center',
      description: DESCRIPTION,
      siteName: 'Indian Jewish Heritage Center',
      locale: 'en',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={[
        spectral.variable,
        plexSans.variable,
        plexMono.variable,
        notoHebrew.variable,
        notoDevanagari.variable,
        notoMalayalam.variable,
        notoArabic.variable,
      ].join(' ')}>
      <body className="flex min-h-dvh flex-col antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:font-medium focus:text-paper focus:shadow-lift"
        >
          Skip to content
        </a>
        <Masthead />
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="mt-24 border-t border-rule bg-paper-2/70">
          <div className="mx-auto max-w-6xl px-6 py-12">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-display text-xl">Indian Jewish Heritage Center</p>
                <p className="mt-1 text-muted">
                  with the Cochin Jewish Heritage Center · preserving two thousand years
                </p>
              </div>

              <nav aria-label="Footer" className="flex flex-col sm:items-end">
                <Link href="/portal" className="inline-flex min-h-11 items-center text-muted transition-colors hover:text-accent">
                  Browse the archive
                </Link>
                <Link href="/upload" className="inline-flex min-h-11 items-center text-muted transition-colors hover:text-accent">
                  Contribute an item
                </Link>
                <Link href="/handling" className="inline-flex min-h-11 items-center text-muted transition-colors hover:text-accent">
                  How your contribution is handled
                </Link>
              </nav>
            </div>

            <p className="mt-10 border-t border-rule pt-6 text-sm leading-relaxed text-muted">
              Every description in this archive was written or checked by a person. Machine
              suggestions are marked as such and are never published unread.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
