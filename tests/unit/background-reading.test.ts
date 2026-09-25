import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * An item sent on before its reading finished (Inon, 25.09.2026, 0032): the
 * server reads it afterwards and finishes the `pending` row. The rules do not
 * relax because nobody is watching - output goes to ai_analyses and to `ai`
 * field rows, never over a row a person or an earlier file wrote.
 */

const calls: { table: string; op: string; payload?: unknown; opts?: unknown; filters: [string, unknown][] }[] = [];

function table(name: string) {
  const record = (op: string, payload?: unknown, opts?: unknown) => {
    const entry = { table: name, op, payload, opts, filters: [] as [string, unknown][] };
    calls.push(entry);
    const chain = {
      eq: (col: string, val: unknown) => (entry.filters.push([col, val]), chain),
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
    };
    return chain;
  };
  return {
    update: (payload: unknown) => record('update', payload),
    upsert: (payload: unknown, opts: unknown) => record('upsert', payload, opts),
  };
}

const download = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabase: () => ({
    from: table,
    storage: { from: () => ({ download, upload: vi.fn(async () => ({ error: null })) }) },
  }),
}));

const analyze = vi.fn();
vi.mock('@/lib/ai', () => ({ getAIProvider: () => ({ analyze }) }));
vi.mock('@/lib/vocabulary/load', () => ({ loadVocabulary: async () => [] }));
vi.mock('@/lib/vocabulary/mutations', () => ({ recordCandidates: vi.fn(async () => {}) }));
const recordProblem = vi.fn(async () => {});
vi.mock('@/lib/problems/record', () => ({ recordProblem }));

const { readInBackground } = await import('@/lib/items/background-reading');

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 10, 0, 0, 0, 20]);
const job = { itemId: 'item-1', title: 'A banknote', language: 'he', files: [{ fileId: 'file-1', storagePath: 'uploads/x.png', fileName: 'x.png' }] };

const reading = {
  provider: 'gemini',
  model: 'gemini-3.6-flash',
  summary: 'A five-rupee note.',
  keywords: [],
  newTerms: [],
  language: 'en',
  confidence: 0.9,
  ocrText: 'FIVE RUPEES',
  transcript: null,
  suggestedCommunity: 'baghdadi',
  suggestedPeriod: '1920',
  suggestedOrigin: null,
  reasoning: null,
  evidence: null,
  offTopic: false,
  offTopicReason: null,
  raw: { background: '## What this is\nA note.' },
  fields: [],
};

beforeEach(() => {
  calls.length = 0;
  download.mockReset().mockResolvedValue({ data: new Blob([PNG], { type: 'image/png' }), error: null });
  analyze.mockReset();
  recordProblem.mockClear();
});

describe('reading an item that was sent on unread', () => {
  it('finishes the pending row as succeeded, for that file of that item', async () => {
    analyze.mockResolvedValue(reading);
    await readInBackground(job);

    const done = calls.find((c) => c.table === 'ai_analyses' && c.op === 'update');
    expect(done?.payload).toMatchObject({ status: 'succeeded', summary: 'A five-rupee note.', ocr_text: 'FIVE RUPEES' });
    expect(done?.filters).toEqual([['item_id', 'item-1'], ['file_id', 'file-1']]);
    expect(calls.some((c) => c.table === 'items')).toBe(false); // rule 1
  });

  it('measures the file from its bytes', async () => {
    analyze.mockResolvedValue(reading);
    await readInBackground(job);
    const measured = calls.find((c) => c.table === 'item_files' && c.op === 'update');
    expect(measured?.payload).toMatchObject({ mime_type: 'image/png', width: 10, height: 20 });
  });

  it('never overwrites a field row that already exists', async () => {
    analyze.mockResolvedValue(reading);
    await readInBackground(job);
    const fields = calls.find((c) => c.table === 'item_fields');
    // The media facet is always derived; whatever is written skips existing rows.
    if (fields) expect(fields.opts).toEqual({ onConflict: 'item_id,field_key', ignoreDuplicates: true });
  });

  it('marks the row failed with a problem code when the reading fails', async () => {
    analyze.mockRejectedValue(new Error('quota'));
    await readInBackground(job);
    const failed = calls.find((c) => c.table === 'ai_analyses' && c.op === 'update');
    expect(failed?.payload).toMatchObject({ status: 'failed' });
    expect(String((failed?.payload as { error: string }).error)).toMatch(/\(E-[0-9A-Z]{6}\)/);
    expect(recordProblem).toHaveBeenCalledWith(expect.objectContaining({ place: 'background reading', message: 'quota' }));
  });
});
