import fs from 'node:fs';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ReviewQueue } from '@/components/review-queue';
import { ReviewDraftControls } from '@/components/review-draft-controls';
import { ReviewCandidates } from '@/components/review-candidates';
import { ReviewDraftScope, ReviewReadingDraft } from '@/components/review-draft-scope';
import { MessagesProvider } from '@/lib/i18n/provider';
import { en } from '@/lib/i18n/messages';
import he from '@/lib/i18n/locales/he.json';
import type { ReviewDraftPayload } from '@/lib/items/draft-schema';
import type { ItemDetail } from '@/lib/types';
import { useState } from 'react';
vi.mock('next/navigation', () => ({ usePathname: () => '/review', useRouter: () => ({ refresh: vi.fn() }) }));
const id = '11111111-1111-4111-8111-111111111111';
const analysisId = '22222222-2222-4222-8222-222222222222';
const item = { id, title: 'תמונה משפחתית מבית הכנסת — זיכרונות הקהילה', category: null, status: 'pending', access: 'public', community: 'cochin', keywords: [], contributor_keywords: ['תפילה'], created_at: '2026-01-01', file: null, fields: [], files: [], analysis: null } as unknown as ItemDetail;
const value: ReviewDraftPayload = { baseReviewedAt: null, title: 'Record', description: '', category: '', community: '', provenance: '', language: '', period: '', originPlace: '', keywords: [], familyIds: [], access: 'public', fields: [] };
const json = (data: unknown) => new Response(JSON.stringify({ ok: true, data }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); vi.useRealTimers(); });
function artifact(name: string, html: string) {
  if (process.env.REVIEW_LAYOUT_ARTIFACTS === '1') {
    fs.mkdirSync('docs/review-layout', { recursive: true });
    fs.writeFileSync(`docs/review-layout/${name}.html`, `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./styles.css"><body><main class="mx-auto max-w-6xl px-6 py-8">${html}</main></body></html>`);
  }
}
it('keeps list view usable when localStorage throws, and requires a category before bulk approval', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.stubGlobal('fetch', vi.fn(async () => json({ items: [{ item, familyIds: [], candidates: [] }], vocabulary: [] })));
  const { container } = render(<MessagesProvider catalogue={{ ...en, ...he }}><ReviewQueue items={[item]} /></MessagesProvider>);
  artifact('grid', container.innerHTML);
  fireEvent.click(screen.getByRole('button', { name: 'רשימה' }));
  expect(screen.getByRole('button', { name: 'רשימה' })).toHaveAttribute('aria-pressed', 'true');
  artifact('list', container.innerHTML);
  fireEvent.click(screen.getByLabelText('בחירת כל הרשומות בעמוד'));
  fireEvent.click(screen.getByRole('button', { name: 'אישור הנבחרות (1)' }));
  await screen.findByRole('button', { name: 'אישור 0 רשומות' });
  expect(screen.getByRole('button', { name: 'אישור 0 רשומות' })).toBeDisabled();
  artifact('bulk', container.innerHTML);
  fireEvent.change(screen.getByLabelText('קטגוריה'), { target: { value: 'documents' } });
  expect(screen.getByRole('button', { name: 'אישור 1 רשומות' })).toBeEnabled();
});
it('never overwrites typing with a slow arriving draft', async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(r => { resolve = r; })));
  const restore = vi.fn();
  const { rerender } = render(<ReviewDraftControls itemId={id} value={value} restore={restore} deciding={false} />);
  rerender(<ReviewDraftControls itemId={id} value={{ ...value, title: 'New typing' }} restore={restore} deciding={false} />);
  await act(async () => resolve(json({ payload: { ...value, title: 'Old draft' }, updated_at: '2026-10-20T12:00:00Z' })));
  expect(restore).not.toHaveBeenCalled();
  expect(screen.getByText(/already started editing/i)).toBeVisible();
});
it('saves edited readings privately with the catalogue draft', async () => {
  const fetcher = vi.fn<(url: unknown, init?: RequestInit) => Promise<Response>>(async (...args) => json(args[1]?.method ? { updated_at: '2026-10-20T12:00:00Z' } : null));
  vi.stubGlobal('fetch', fetcher);
  render(<ReviewDraftScope>
    <ReviewDraftControls itemId={id} value={value} restore={vi.fn()} deciding={false} />
    <ReviewReadingDraft analysisId={analysisId} field="transcript" text="Corrected reading" original="Machine reading" restore={vi.fn()} />
  </ReviewDraftScope>);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  // The button stays disabled until the stored draft has loaded; clicking earlier is ignored.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save as draft' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
  await screen.findByText('Draft saved privately. The record is unchanged.');
  const sent = JSON.parse(fetcher.mock.calls[1][1]?.body as string);
  expect(sent.readings).toEqual([{ analysisId, field: 'transcript', text: 'Corrected reading' }]);
  expect(sent.title).toBe('Record');
});

it('autosaves a changed draft after 30 seconds, not an unchanged restored draft', async () => {
  vi.useFakeTimers();
  const stored = { ...value, title: 'Restored record', readings: [] };
  const fetcher = vi.fn<(url: unknown, init?: RequestInit) => Promise<Response>>(async (...args) =>
    json(args[1]?.method ? { updated_at: '2026-10-20T12:00:30Z' } : { payload: stored, updated_at: '2026-10-20T12:00:00Z' }));
  vi.stubGlobal('fetch', fetcher);
  function Harness() {
    const [draft, setDraft] = useState(value);
    return <>
      <label>Test title<input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <ReviewDraftControls itemId={id} value={draft} restore={setDraft} deciding={false} />
    </>;
  }
  await act(async () => { render(<Harness />); });
  expect(screen.getByLabelText('Test title')).toHaveValue('Restored record');
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Test title'), { target: { value: 'Edited record' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetcher.mock.calls[1][1]?.body as string).title).toBe('Edited record');
});

it('offers candidate creation and similar existing terms without promoting anything on load', async () => {
  const onChange = vi.fn();
  const candidate = { id: analysisId, term: 'תפילה בבית הכנסת בקוצ׳ין', source: 'contributor', similar: [{ id, term: 'בית הכנסת בקוצ׳ין', score: 0.7 }] };
  const fetcher = vi.fn<(url: unknown, init?: RequestInit) => Promise<Response>>(async (...args) => json(args[1]?.method ? { term: candidate.term } : [candidate]));
  vi.stubGlobal('fetch', fetcher);
  const { container } = render(<MessagesProvider catalogue={{ ...en, ...he }}><ReviewCandidates itemId={id} keywords={[]} onChange={onChange} /></MessagesProvider>);
  await screen.findByRole('button', { name: 'יצירת המונח' });
  expect(onChange).not.toHaveBeenCalled();
  artifact('candidates', container.innerHTML);
  fireEvent.click(screen.getByRole('button', { name: 'שימוש ב״בית הכנסת בקוצ׳ין״ במקום' }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(['בית הכנסת בקוצ׳ין']));
  expect(JSON.parse(fetcher.mock.calls[1][1]?.body as string)).toEqual({ id: analysisId, action: 'decline' });
});

it('renders private draft controls with a visible restoration notice in Hebrew', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ payload: value, updated_at: '2026-10-20T12:00:00Z' })));
  const { container } = render(<MessagesProvider catalogue={{ ...en, ...he }}><ReviewDraftControls itemId={id} value={value} restore={vi.fn()} deciding={false} /></MessagesProvider>);
  await screen.findByRole('button', { name: 'מחיקת הטיוטה' });
  expect(screen.getByRole('status').textContent).toContain('שוחזרה');
  artifact('draft', container.innerHTML);
});
