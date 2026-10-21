import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TagPicker } from '@/components/tag-picker';
import { ReviewWorkbench } from '@/components/review-workbench';
import { ReviewBulkTable } from '@/components/review-bulk-table';
import { MessagesProvider } from '@/lib/i18n/provider';
import he from '@/lib/i18n/locales/he.json';
import type { ItemDetail } from '@/lib/types';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/components/review-candidates', () => ({ ReviewCandidates: () => null }));
vi.mock('@/components/review-server-actions', () => ({ ReviewServerActions: () => null }));
vi.mock('@/components/review-draft-controls', () => ({ ReviewDraftControls: () => null }));
vi.mock('@/components/file-preview', () => ({ FilePreview: () => null }));
vi.mock('@/components/translation-deck', () => ({ TranslationDeck: () => null }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const json = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200 });
const item = { id: 'one', title: 'Record', status: 'pending', category: 'documents', community: null,
  keywords: [], contributor_keywords: [], access: 'public', files: [], file: null, fields: [], analysis: null, contributor: null } as unknown as ItemDetail;

it('creates a workbench free-text term inline, then includes it in the explicit review action', async () => {
  const fetcher = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async url => json(url === '/api/manage/keywords'
    ? { keyword: { term: 'Family album' } } : { id: 'one', status: 'accepted' }));
  vi.stubGlobal('fetch', fetcher);
  render(<ReviewWorkbench item={item} vocabulary={[]} families={[]} selectedFamilyIds={[]} siteLanguage="en" />);
  fireEvent.change(screen.getByLabelText('Add a tag'), { target: { value: ' Family album ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create and add “Family album”' }));
  expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
  await screen.findByRole('button', { name: 'Remove Family album' });
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ term: 'Family album', community: null });
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string).keywords).toEqual(['Family album']);
});

it('preserves choices made elsewhere while a tag creation is in flight', async () => {
  let finish!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const change = vi.fn();
  const view = render(<TagPicker expert chosen={[]} offered={[]} suggested={[]} onChange={change} />);
  fireEvent.change(screen.getByLabelText('Add a tag'), { target: { value: 'New tag' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create and add “New tag”' }));
  view.rerender(<TagPicker expert chosen={['Other choice']} offered={[]} suggested={[]} onChange={change} />);
  finish(json({ keyword: { term: 'New tag' } }));
  await waitFor(() => expect(change).toHaveBeenCalledWith(['Other choice', 'New tag']));
});

it('keeps a failed creation editable and prevents double submission', async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', fetcher);
  render(<TagPicker expert chosen={[]} offered={[]} suggested={[]} onChange={vi.fn()} />);
  const input = screen.getByLabelText('Add a tag');
  fireEvent.change(input, { target: { value: 'New tag' } });
  const add = screen.getByRole('button', { name: 'Create and add “New tag”' });
  fireEvent.click(add); fireEvent.click(add);
  expect(fetcher).toHaveBeenCalledOnce();
  finish(new Response(JSON.stringify({ ok: false, error: { message: 'Try again' } }), { status: 500 }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Try again');
  expect(input).toHaveValue('New tag');
  expect(add).toBeEnabled();
});

it('shows contributor proposals as chosen in Hebrew, beyond twenty tags, without writing vocabulary', () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  function Harness() {
    const [chosen, setChosen] = useState(Array.from({ length: 21 }, (_, i) => `Tag ${i}`));
    return <MessagesProvider catalogue={he}><div dir="rtl" style={{ width: 375 }}>
      <TagPicker chosen={chosen} offered={[]} suggested={[]} onChange={setChosen} />
    </div></MessagesProvider>;
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText(he['prereview.addTag']), { target: { value: 'תמונה משפחתית' } });
  fireEvent.click(screen.getByRole('button', { name: he['public.suggestTag'].replace('{text}', 'תמונה משפחתית') }));
  const remove = screen.getByRole('button', { name: he['prereview.removeTag'].replace('{term}', 'תמונה משפחתית') });
  expect(within(remove.closest('li')!).getByText(he['tags.proposed'])).toBeVisible();
  expect(remove.className).toContain('min-h-11');
  expect(remove.className).toContain('focus-visible:outline-2');
  expect(fetcher).not.toHaveBeenCalled();
});

it('bulk review allows a suggested term without an open candidate and adds a free-text term per row', async () => {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/manage/keywords') return json({ keyword: { term: 'Typed tag' } });
    if (init?.method === 'POST') return json({ results: [{ id: 'one', ok: true }] });
    return json({ vocabulary: [], items: [{ item: { ...item, analysis: { keywords: ['AI tag'] } }, familyIds: [], candidates: [] }] });
  });
  vi.stubGlobal('fetch', fetcher);
  render(<ReviewBulkTable ids={['one']} close={vi.fn()} completed={vi.fn()} />);
  const checkbox = await screen.findByRole('checkbox', { name: /AI tag/ });
  expect(checkbox).toBeEnabled(); fireEvent.click(checkbox);
  fireEvent.change(screen.getByLabelText('Add a tag'), { target: { value: 'Typed tag' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create and add “Typed tag”' }));
  await screen.findByRole('button', { name: 'Remove Typed tag' });
  fireEvent.click(screen.getByRole('button', { name: /Approve.*1/i }));
  await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.body?.toString().includes('"items"'))).toBe(true));
  const payload = JSON.parse(fetcher.mock.calls.find(([, init]) => init?.body?.toString().includes('"items"'))![1]!.body as string);
  expect(payload.items[0].review.keywords).toEqual(['AI tag', 'Typed tag']);
});
