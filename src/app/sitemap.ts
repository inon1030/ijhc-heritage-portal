import type { MetadataRoute } from 'next';
import { listPublishedItems } from '@/lib/items/queries';
import { siteUrl } from '@/lib/site';

/**
 * Every address a stranger is meant to find.
 *
 * Published records only — the same list the portal shows, built from the same
 * query, so a record that is rejected, held or binned can never appear here by
 * a path this file forgot to check.
 *
 * `lastModified` is the record's own updated_at, which is what tells a crawler
 * that a re-catalogued record is worth fetching again.
 */
/*
 * Rendered on demand, not at build time.
 *
 * The query that lists published records reads the language cookie, and a
 * cookie cannot be read while prerendering — so a build-time sitemap silently
 * lost every record and shipped with the static pages alone. Caught in the
 * build log on 16.09.2026.
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  const pages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/portal`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/upload`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/handling`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/accessibility`, changeFrequency: 'yearly', priority: 0.3 },
  ];

  try {
    const items = await listPublishedItems();
    for (const item of items) {
      pages.push({
        url: `${base}/portal/${item.id}`,
        lastModified: new Date(item.updated_at ?? item.created_at),
        changeFrequency: 'monthly',
        priority: 0.6,
      });
    }
  } catch (error) {
    // A sitemap that lists the pages it is sure of beats a 500. The records are
    // reachable from the portal either way.
    console.error('[sitemap] could not list published records', error);
  }

  return pages;
}
