import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { IBM_Plex_Mono, IBM_Plex_Sans, Spectral } from 'next/font/google';
import { Masthead } from '@/components/masthead';
import './globals.css';

/**
 * Spectral for display: a bookish serif with the language coverage an archive
 * of Hebrew, Marathi, Malayalam and English material needs.
 * Plex Sans for interface, Plex Mono for anything a machine produced.
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
    <html lang="en" className={`${spectral.variable} ${plexSans.variable} ${plexMono.variable}`}>
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
