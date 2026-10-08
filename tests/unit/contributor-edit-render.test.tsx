import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { en, format } from '@/lib/i18n/messages';
import he from '@/lib/i18n/locales/he.json';
import { MessagesProvider } from '@/lib/i18n/provider';
import { ContributorEditForm } from '@/components/contributor-edit';

const mocks = vi.hoisted(() => ({ item: vi.fn(), verify: vi.fn(), refresh: vi.fn(), language: 'en' }));
vi.mock('@/lib/items/queries', () => ({ getReceiptItem: mocks.item }));
vi.mock('@/lib/items/receipt', () => ({ verifyReceipt: mocks.verify }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/components/file-preview', () => ({ FilePreview: () => null }));
vi.mock('@/lib/i18n', () => ({ getMessages: async () => ({ t: (key: keyof typeof en, vars?: Record<string, string | number>) => format((mocks.language === 'he' ? { ...en, ...he } : en)[key], vars) }) }));
import ReceiptPage from '@/app/receipt/[id]/page';

beforeEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); mocks.language = 'en'; mocks.verify.mockReturnValue(true); });
const props = { params: Promise.resolve({ id: 'one' }), searchParams: Promise.resolve({ t: 'signed' }) };
it.each(['en', 'he'])('published receipt has a clear sentence and no edit form (%s)', async (language) => {
  mocks.language = language;
  mocks.item.mockResolvedValue({ title: 'Family', status: 'accepted', access: 'public', deleted_at: null, created_at: '2026-10-08', item_files: [] });
  render(await ReceiptPage(props));
  expect(screen.getByText(language === 'he' ? he['receipt.editPublished'] : en['receipt.editPublished'])).toBeInTheDocument();
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: en['receipt.editAction'] })).not.toBeInTheDocument();
});
it.each(['rejected', 'shadow_gallery', 'restricted', 'deleted'])('does not offer editing for %s', async (state) => {
  mocks.item.mockResolvedValue({ title: 'Family', status: state === 'restricted' ? 'accepted' : state === 'deleted' ? 'pending' : state,
    access: state === 'restricted' ? 'researchers' : 'public', deleted_at: state === 'deleted' ? '2026-10-08' : null, created_at: '2026-10-08', item_files: [] });
  render(await ReceiptPage(props));
  expect(screen.queryByRole('button', { name: en['receipt.editAction'] })).not.toBeInTheDocument();
  expect(screen.getByText(en[state === 'deleted' ? 'receipt.editWithdrawn' : 'receipt.editReviewed'])).toBeInTheDocument();
});
it('does not read a receipt item for an invalid signature', async () => {
  mocks.verify.mockReturnValue(false);
  render(await ReceiptPage(props));
  expect(mocks.item).not.toHaveBeenCalled();
});

function form(hebrew = false) {
  return render(<MessagesProvider catalogue={hebrew ? he : en}><div dir={hebrew ? 'rtl' : 'ltr'} style={{ width: 375 }}>
    <ContributorEditForm itemId="one" token="signed" title="Family" description="Our family" />
  </div></MessagesProvider>);
}
it('opens Hebrew labelled fields with focus, posts only allowed data on the same token and announces success', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
  vi.stubGlobal('fetch', fetch);
  form(true);
  fireEvent.click(screen.getByRole('button', { name: he['receipt.editAction'] }));
  expect(screen.getByLabelText(he['receipt.editTitle'])).toHaveFocus();
  fireEvent.change(screen.getByLabelText(he['receipt.editDescription']), { target: { value: 'סבתא שלנו' } });
  fireEvent.click(screen.getByRole('button', { name: he['receipt.editSave'] }));
  await screen.findByText(he['receipt.editSaved']);
  expect(fetch).toHaveBeenCalledWith('/api/items/one/contributor-edit?t=signed', expect.objectContaining({ body: JSON.stringify({ title: 'Family', contributorDescription: 'סבתא שלנו' }) }));
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: he['receipt.editAction'] })).toHaveFocus();
});
it('replaces an open form with the published sentence after a conflict', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ ok: false, error: { code: 'receipt.editPublished' } }) }));
  form(); fireEvent.click(screen.getByRole('button', { name: en['receipt.editAction'] }));
  fireEvent.click(screen.getByRole('button', { name: en['receipt.editSave'] }));
  await screen.findByText(en['receipt.editPublished']);
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
});
it('keeps a failed draft and lets the contributor retry', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  form(); fireEvent.click(screen.getByRole('button', { name: en['receipt.editAction'] }));
  fireEvent.change(screen.getByLabelText(en['receipt.editTitle']), { target: { value: 'New title' } });
  fireEvent.click(screen.getByRole('button', { name: en['receipt.editSave'] }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText(en['receipt.editTitle'])).toHaveValue('New title');
  await waitFor(() => expect(screen.getByRole('button', { name: en['receipt.editSave'] })).toBeEnabled());
});
