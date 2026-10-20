import fs from 'node:fs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PickedFile } from '@/components/file-picker';

vi.mock('@/components/file-picker', () => ({ FilePicker: ({ onChange }: { onChange: (files: PickedFile[]) => void }) =>
  <button onClick={() => onChange([{ id: 'one', file: new File(['image'], 'one.png', { type: 'image/png' }), previewUrl: null }])}>Pick fixture</button> }));
vi.mock('@/components/phone-scanner', () => ({ PhoneScanner: () => null }));
vi.mock('@/components/link-input', () => ({ LinkInput: () => null }));
vi.mock('@/components/consent-block', () => ({ ConsentBlock: ({ onChange }: { onChange: (value: boolean) => void }) =>
  <button onClick={() => onChange(true)}>Agree fixture</button> }));
vi.mock('@/lib/i18n/language-lock', () => ({ lockLanguage: () => () => {} }));
vi.mock('@/lib/files/measure', () => ({ measureDuration: async () => null }));
const upload = vi.fn(async () => ({ error: null }));
vi.mock('@/lib/supabase/browser', () => ({ createBrowserSupabase: () => ({ storage: { from: () => ({ uploadToSignedUrl: upload }) } }) }));
import { UploadFlow } from '@/components/upload-flow';

const fetchMock = vi.fn();
beforeEach(() => {
  upload.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/uploads/sign') return { json: async () => ({ ok: true, data: { path: 'uploads/one.png', token: 'x', grant: 'proof', expiresAt: 100 } }) };
    if (url === '/api/items') return { json: async () => ({ ok: true, data: { id: 'saved', receipt: 'receipt' } }) };
    throw new Error(`Unexpected request: ${url}`);
  });
});
afterEach(() => vi.unstubAllGlobals());

it('sends without a foreground analysis, retains the community claim and requests the existing background reading', async () => {
  const { container } = render(<UploadFlow vocabulary={[]} mark={null} languages={[]} siteLanguage="en" />);
  fireEvent.change(screen.getByLabelText('Community (optional)'), { target: { value: 'cochin' } });
  fireEvent.click(screen.getByLabelText('Credit required for the collector'));
  fireEvent.change(screen.getByLabelText('Collector name'), { target: { value: 'Family collection' } });
  fireEvent.click(screen.getByText('Pick fixture'));
  fireEvent.click(screen.getByRole('button', { name: /Next/ }));
  expect(screen.getByRole('button', { name: 'Send without waiting' })).toBeDisabled();
  fireEvent.change(container.querySelector('input[type="email"]')!, { target: { value: 'person@example.org' } });
  fireEvent.click(screen.getByText('Agree fixture'));
  fireEvent.click(screen.getByRole('button', { name: 'Send without waiting' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === '/api/items')).toBe(true));
  expect(upload).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/uploads/sign', '/api/items']);
  const payload = JSON.parse(fetchMock.mock.calls.find(([url]) => url === '/api/items')![1].body);
  const signPayload = JSON.parse(fetchMock.mock.calls.find(([url]) => url === '/api/uploads/sign')![1].body);
  expect(signPayload.checksum).toMatch(/^[a-f0-9]{64}$/);
  expect(payload).toMatchObject({ collectorName: 'Family collection', collectorCreditRequired: true, contributorLanguage: 'en' });
  expect(payload).toMatchObject({ communityHint: 'cochin', contributorFields: [{ key: 'community', value: 'cochin', source: 'contributor' }] });
  expect(payload.files[0]).toMatchObject({ analysis: null, analysisPending: true });
});
async function reachReading() {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/uploads/sign') return { json: async () => ({ ok: true, data: { path: 'uploads/one.png', token: 'x', grant: 'proof', expiresAt: 9999999999 } }) };
    if (url === '/api/analyze') return { json: async () => ({ ok: true, data: { metadata: { mimeType: 'image/png', byteSize: 5 }, analysis: { summary: 'Machine description', keywords: [], fields: [], backgroundSources: [], ocrText: null, transcript: null } } }) };
    throw new Error(`Unexpected request: ${url}`);
  });
  const rendered = render(<UploadFlow vocabulary={[]} mark={null} languages={[]} siteLanguage="en" />);
  fireEvent.click(screen.getByText('Pick fixture'));
  fireEvent.click(screen.getByRole('button', { name: /Next/ }));
  fireEvent.change(rendered.container.querySelector('input[type="email"]')!, { target: { value: 'person@example.org' } });
  fireEvent.click(screen.getByText('Agree fixture'));
  fireEvent.click(screen.getByRole('button', { name: 'Read it with AI' }));
  await screen.findByLabelText('Your description');
  if(process.env.PHASE1_FIXTURES==='1') fs.writeFileSync('.guide-tmp/phase1-2010/upload.html',`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><body><main class="mx-auto max-w-6xl px-6 py-6">${rendered.container.innerHTML}</main></body></html>`);
  return rendered;
}

it('returns through steps one and two without rereading or losing corrections', async () => {
  await reachReading();
  fireEvent.change(screen.getByLabelText('Your description'), { target: { value: 'My correction' } });
  fireEvent.click(screen.getByRole('button', { name: '1. Files' }));
  fireEvent.click(screen.getByRole('button', { name: /Next/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Return to your corrections' }));
  expect(screen.getByLabelText('Your description')).toHaveValue('My correction');
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/analyze')).toHaveLength(1);
});

it('asks once before replacing edited drafts, and cancellation preserves them', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await reachReading();
  fireEvent.change(screen.getByLabelText('Your description'), { target: { value: 'My correction' } });
  fireEvent.click(screen.getByRole('button', { name: '2. Details' }));
  fireEvent.change(screen.getByRole('textbox', { name: /What do you know/ }), { target: { value: 'New facts' } });
  fireEvent.click(screen.getByRole('button', { name: 'Read it with AI' }));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/analyze')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '3. Review' }));
  expect(screen.getByLabelText('Your description')).toHaveValue('My correction');
  fireEvent.click(screen.getByRole('button', { name: '2. Details' }));
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'Read it with AI' }));
  await waitFor(() => expect(screen.getByLabelText('Your description')).toHaveValue('Machine description'));
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/analyze')).toHaveLength(2);
  confirm.mockRestore();
});

it('guards reload only while unsent material exists and removes the listener on unmount', () => {
  const { unmount } = render(<UploadFlow vocabulary={[]} mark={null} languages={[]} siteLanguage="en" />);
  const clean = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  fireEvent.click(screen.getByText('Pick fixture'));
  const dirty = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(dirty);
  expect(dirty.defaultPrevented).toBe(true);
  unmount();
  const after = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
});
import { MessagesProvider } from '@/lib/i18n/provider';
import he from '@/lib/i18n/locales/he.json';
it('labels all three upload steps in Hebrew and keeps uncompleted steps disabled', () => {
  const { container } = render(<MessagesProvider catalogue={he}><div dir="rtl"><UploadFlow vocabulary={[]} mark={null} languages={[]} siteLanguage="he" /></div></MessagesProvider>);
  expect(screen.getByRole('button', {name:`3. ${he['flow.navReview']}`})).toBeDisabled();
  expect(screen.getByRole('navigation', {name:he['flow.steps']})).toBeInTheDocument();
  if(process.env.PHASE1_FIXTURES==='1') fs.writeFileSync('.guide-tmp/phase1-2010/upload-rtl.html',`<!doctype html><html dir="rtl" lang="he"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><body><main class="mx-auto max-w-6xl px-6 py-6">${container.innerHTML}</main></body></html>`);
});
