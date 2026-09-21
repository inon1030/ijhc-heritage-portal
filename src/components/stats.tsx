'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMessages } from '@/lib/i18n/provider';
import { STATS_COOKIE, isMeasurable, type StatsChoice } from '@/lib/stats';

/**
 * The banner, and the two scripts behind it.
 *
 * The banner is a strip at the foot of the page rather than a curtain over it:
 * this is an archive, and a visitor who followed a link to a photograph of
 * their grandmother should be able to read it without dismissing anything. It
 * does not reappear once answered either way.
 *
 * Google's own consent mode is set to denied *before* the tag loads, so even
 * the first request carries the refusal rather than relying on the script not
 * having been added yet.
 */
export function Stats({
  measurementId,
  heatmapId,
  initial,
  bucket,
}: {
  measurementId: string | null;
  heatmapId: string | null;
  initial: StatsChoice;
  /** The visitor's A/B bucket, so a result can be read per variant. */
  bucket: number | null;
}) {
  const t = useMessages();
  const pathname = usePathname();
  const [choice, setChoice] = useState<StatsChoice>(initial);
  const configured = Boolean(measurementId || heatmapId);
  const measurable = isMeasurable(pathname ?? '/');

  // A page view per navigation, because the app never reloads between pages.
  useEffect(() => {
    if (choice !== 'granted' || !measurementId || !measurable) return;
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    gtag?.('event', 'page_view', { page_path: pathname });
  }, [pathname, choice, measurementId, measurable]);

  function decide(next: Exclude<StatsChoice, null>) {
    setChoice(next);
    document.cookie = `${STATS_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
    if (next === 'denied') {
      // Anything already set by a previous "yes" goes now.
      for (const name of document.cookie.split(';').map((c) => c.split('=')[0].trim())) {
        if (name.startsWith('_ga') || name.startsWith('_clck') || name.startsWith('_clsk')) {
          document.cookie = `${name}=; path=/; max-age=0`;
        }
      }
    }
  }

  return (
    <>
      {choice === 'granted' && measurable && measurementId && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
          <Script id="ga-setup" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
window.gtag=gtag;gtag('js',new Date());
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'granted'});
gtag('config','${measurementId}',{anonymize_ip:true,send_page_view:false${bucket === null ? '' : `,user_properties:{ab_bucket:'${bucket}'}`}});`}
          </Script>
        </>
      )}

      {choice === 'granted' && measurable && heatmapId && (
        <Script id="heatmap" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${heatmapId}");`}
        </Script>
      )}

      {configured && choice === null && (
        <div
          role="region"
          aria-label={t('stats.heading')}
          className="sticky bottom-0 z-40 border-t border-rule bg-paper/95 backdrop-blur-sm"
        >
          <div className="mx-auto flex max-w-4xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-relaxed text-muted">
              {t('stats.body')}{' '}
              <a href="/privacy" className="underline underline-offset-2 hover:text-accent-strong">
                {t('nav.privacy')}
              </a>
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => decide('denied')}
                className="h-11 rounded-full border border-rule px-4 text-sm transition-colors hover:border-accent-strong"
              >
                {t('stats.decline')}
              </button>
              <button
                type="button"
                onClick={() => decide('granted')}
                className="h-11 rounded-full bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary-strong"
              >
                {t('stats.accept')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
