import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

/**
 * What a crawler may read.
 *
 * The public portal and the pages that explain it, and nothing else. The review
 * and administration screens are closed by session anyway, but a crawler that
 * knows they exist will keep asking; `/receipt` is a contributor's private link
 * and must never appear in a search result; `/api` answers nothing useful to an
 * index and every file it serves is permission-checked.
 *
 * On a preview deployment the whole site is closed, so the copies Vercel mints
 * on each push cannot compete with the archive in search.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  const isPreview = process.env.VERCEL_ENV === 'preview';

  if (isPreview) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/portal', '/upload', '/handling'],
        disallow: ['/api/', '/manage', '/review', '/receipt', '/login'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
