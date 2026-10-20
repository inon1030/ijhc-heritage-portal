import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, ok, readJson, unexpected } from '@/lib/api';
import { getCurrentVolunteer } from '@/lib/supabase/server';
import { getMessages } from '@/lib/i18n';
import { getItemDetail, readReviewCandidates } from '@/lib/items/queries';
import { listItemFamilyIds } from '@/lib/vocabulary/queries';
import { readVocabulary } from '@/lib/vocabulary/load';
import { POST as review } from '@/lib/items/review-handler';

export const maxDuration = 300;

const Ids = z.array(z.string().uuid()).min(1).max(50).refine(ids => new Set(ids).size === ids.length);
const Batch = z.object({ items: z.array(z.object({ id: z.string().uuid(), review: z.record(z.string(), z.unknown()) })).min(1).max(50) })
  .refine(body => new Set(body.items.map(item => item.id)).size === body.items.length);

export async function GET(request: NextRequest) {
  const { t } = await getMessages();
  if (!await getCurrentVolunteer()) return fail(401, 'unauthenticated', t('review3.signIn'));
  const ids = Ids.safeParse(request.nextUrl.searchParams.getAll('id'));
  if (!ids.success) return fail(400, 'invalid_request', t('review3.batchLimit'));
  try {
    const items = [];
    for (const id of ids.data) {
      const item = await getItemDetail(id);
      if (!item) continue;
      // No OCR, raw model responses, files or contributor contact details in
      // a 50-row review table. Only fields used by the existing approval body.
      items.push({
        item: {
          id: item.id, title: item.title, description: item.description,
          category: item.category, community: item.community, provenance: item.provenance,
          language: item.language, period: item.period, origin_place: item.origin_place,
          access: item.access, keywords: item.keywords, contributor_keywords: item.contributor_keywords,
          fields: item.fields, analysis: item.analysis ? { keywords: item.analysis.keywords } : null,
        },
        familyIds: await listItemFamilyIds(id), candidates: await readReviewCandidates(id),
      });
    }
    return ok({ items, vocabulary: await readVocabulary() });
  } catch (error) { return unexpected(error, '/api/items/bulk-review'); }
}

export async function POST(request: NextRequest) {
  const { t } = await getMessages();
  if (!await getCurrentVolunteer()) return fail(401, 'unauthenticated', t('review3.signIn'));
  const body = Batch.safeParse(await readJson(request));
  if (!body.success) return fail(400, 'invalid_request', t('review3.batchLimit'));
  const results = [];
  // Direct invocation, not an HTTP loopback: exact single-item validation,
  // session, mutation, notifications and revalidation. Each failure is isolated.
  for (const entry of body.data.items) {
    const response = await review(new NextRequest(request.url, {
      method: 'POST', headers: request.headers,
      body: JSON.stringify({ ...entry.review, status: 'accepted' }),
    }), { params: Promise.resolve({ id: entry.id }) });
    results.push({ id: entry.id, status: response.status, ...await response.json() });
  }
  return ok({ results });
}
