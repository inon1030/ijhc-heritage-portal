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
  expect(payload).toMatchObject({ communityHint: 'cochin', contributorFields: [{ key: 'community', value: 'cochin', source: 'contributor' }] });
  expect(payload.files[0]).toMatchObject({ analysis: null, analysisPending: true });
});
