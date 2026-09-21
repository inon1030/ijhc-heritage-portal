import 'server-only';

/**
 * The archive's own address.
 *
 * `NEXT_PUBLIC_SITE_URL` is the answer once a domain is connected. Until then
 * Vercel's own hostname is used, so a sitemap generated before the domain
 * arrives still points at pages that exist rather than at localhost.
 *
 * No trailing slash, ever: every URL in the sitemap is built by appending a
 * path, and `https://example.org//portal` is a different address to a crawler.
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`;

  return 'http://localhost:3000';
}
