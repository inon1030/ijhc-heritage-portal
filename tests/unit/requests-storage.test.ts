import { expect, it, vi } from 'vitest';
import type { AnalysisResult } from '@/lib/ai/types';

const writes: { table: string; payload: unknown }[] = [];
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabase: () => ({ from: (table: string) => ({
  insert: (payload: unknown) => {
    writes.push({ table, payload });
    const chain = {
      select: () => chain,
      single: async () => ({ data: { id: 'item', title: 'Wedding' }, error: null }),
      then: (resolve: (value: unknown) => void) => resolve({ data: table === 'item_files' ? [{ id: 'file', storage_path: 'x' }] : null, error: null }),
    };
    return chain;
  },
}) }) }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn() }));
vi.mock('@/lib/contributors', () => ({ registerContributor: vi.fn() }));
vi.mock('@/lib/vocabulary/mutations', () => ({ recordCandidates: vi.fn() }));
import { createItem } from '@/lib/items/mutations';

it('keeps corrected text beside the AI original and an agreeing community as a contributor row', async () => {
  const contributorText = { summary: 'pallu', background: 'Sari head covering', keywords: [], backgroundSources: [] };
  await createItem({
    title: 'Wedding', source: null, sourceUrl: null, contributorEmail: null, contributorFullName: null,
    consentVersion: 'test', contributorDescription: 'pallu', contributorKeywords: [],
    contributorFields: [{ key: 'community', value: 'cochin', source: 'contributor' }, { key: 'material', value: 'silk', source: 'contributor', note: 'pallu' }],
    files: [{ storagePath: 'x', fileName: 'x.png', mimeType: 'image/png', byteSize: 12, width: null, height: null, durationMs: null, previewPath: null, analysisError: null,
      contributorText,
      analysis: { summary: 'veil', fields: [{ key: 'community', value: 'cochin', basis: 'read', confidence: 0.9, note: 'written' }], raw: { background: 'veil' } } as AnalysisResult,
    }],
  });
  const item = writes.find((entry) => entry.table === 'items')!.payload;
  expect(item).not.toHaveProperty('community');
  expect(item).not.toHaveProperty('description');
  const analyses = writes.find((entry) => entry.table === 'ai_analyses')!.payload as Record<string, unknown>[];
  expect(analyses[0]).toMatchObject({ summary: 'veil', raw: { background: 'veil', contributorText } });
  expect(writes.find((entry) => entry.table === 'item_fields')!.payload).toEqual(expect.arrayContaining([
    expect.objectContaining({ field_key: 'community', value: 'cochin', source: 'contributor', basis: null }),
    expect.objectContaining({ field_key: 'material', note: 'pallu', source: 'contributor' }),
  ]));
});
