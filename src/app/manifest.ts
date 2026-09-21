import type { MetadataRoute } from 'next';
import { getMessages } from '@/lib/i18n';

/**
 * What a phone saves when somebody keeps the archive on their home screen.
 *
 * Read in the reader's language, like the share card is: a Hebrew visitor who
 * saves the archive should not find an English name under the icon.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { t, language } = await getMessages();

  return {
    name: t('site.name'),
    short_name: 'IJHC',
    description: t('site.description'),
    start_url: '/portal',
    display: 'standalone',
    lang: language.code,
    dir: language.rtl ? 'rtl' : 'ltr',
    background_color: '#fdfbf7',
    theme_color: '#fdfbf7',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
