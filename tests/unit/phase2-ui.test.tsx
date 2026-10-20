import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FilePreview } from '@/components/file-preview';
import { PasswordRecoveryForm } from '@/components/password-recovery-form';
import { ReviewServerActions } from '@/components/review-server-actions';
import { MessagesProvider } from '@/lib/i18n/provider';
import { en } from '@/lib/i18n/messages';
import he from '@/lib/i18n/locales/he.json';
import type { ItemFile } from '@/lib/types';
let pathname = '/portal/item';
const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ push, refresh }) }));
const file = (mime_type: string) => ({ id: 'file', mime_type, preview_path: null, storage_path: 'path' }) as ItemFile;
beforeEach(() => { pathname = '/portal/item'; vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('public viewing deterrents', () => {
  it('prevents image dragging and context menus only in the portal', () => {
    const { rerender } = render(<FilePreview file={file('image/jpeg')} alt="Archive photo" />);
    const image = screen.getByAltText('Archive photo');
    expect(image).toHaveAttribute('draggable', 'false');
    expect(image).toHaveAttribute('data-public-media');
    expect(fireEvent.contextMenu(image)).toBe(false);
    pathname = '/review/item';
    rerender(<FilePreview file={file('image/jpeg')} alt="Archive photo" />);
    expect(image).not.toHaveAttribute('draggable');
    expect(image).not.toHaveAttribute('data-public-media');
    expect(fireEvent.contextMenu(image)).toBe(true);
  });
  it('keeps public video playback but removes download, remote playback and PiP controls', () => {
    const { container, rerender } = render(<FilePreview file={file('video/mp4')} alt="Recording" />);
    expect(container.querySelector('video')).toHaveAttribute('controlslist', 'nodownload noremoteplayback');
    expect(container.querySelector('video')).toHaveAttribute('disablepictureinpicture');
    pathname = '/review/item';
    rerender(<FilePreview file={file('video/mp4')} alt="Recording" />);
    expect(container.querySelector('video')).not.toHaveAttribute('controlslist');
    expect(container.querySelector('video')).not.toHaveAttribute('disablepictureinpicture');
  });
  it('protects audio and document preview links', () => {
    const { container, rerender } = render(<FilePreview file={file('audio/mpeg')} alt="Audio" />);
    expect(container.querySelector('audio')).toHaveAttribute('controlslist', 'nodownload noremoteplayback');
    rerender(<FilePreview file={file('application/pdf')} alt="Document" />);
    expect(screen.getByRole('link')).toHaveAttribute('data-public-media');
    expect(fireEvent.contextMenu(screen.getByRole('link'))).toBe(false);
  });
});

describe('password forms', () => {
  it('has visible Hebrew labels, 44px controls and a request-new-link action', () => {
    const { rerender } = render(<MessagesProvider catalogue={{ ...en, ...he }}><PasswordRecoveryForm /></MessagesProvider>);
    expect(screen.getByLabelText(he['login.email'])).toHaveAttribute('type', 'email');
    expect(screen.getByRole('button')).toHaveClass('min-h-11');
    rerender(<MessagesProvider catalogue={{ ...en, ...he }}><PasswordRecoveryForm reset /></MessagesProvider>);
    expect(screen.getByRole('link', { name: he['recovery.requestNew'] })).toHaveAttribute('href', '/login/forgot');
  });
  it('checks password confirmation before any server request', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { container } = render(<PasswordRecoveryForm reset tokenHash={'a'.repeat(64)} />);
    fireEvent.change(screen.getByLabelText(en['login.password']), { target: { value: '1234567890' } });
    fireEvent.change(screen.getByLabelText(en['recovery.confirm']), { target: { value: 'different-password' } });
    fireEvent.submit(container.querySelector('form')!);
    expect(await screen.findByRole('status')).toHaveTextContent(en['recovery.mismatch']);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
describe('expert duplicate confirmation', () => {
  it('does not merge until the confirmation is pressed', async () => {
    const fetcher = vi.fn(async (_url: string, options?: RequestInit) => ({
      ok: true, json: async () => options?.method === 'POST' ? { data: { keptId: 'older' } } :
        { data: _url.endsWith('duplicates') ? [{ id: 'pair', reason: 'same_content', item: { id: 'older', title: 'Older record', thumbnail: null } }] : [] },
    }));
    vi.stubGlobal('fetch', fetcher);
    render(<ReviewServerActions itemId="newer" />);
    fireEvent.click(await screen.findByRole('button', { name: en['duplicates.merge'] }));
    expect(fetcher.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(0);
    expect(screen.getByRole('alert')).toHaveTextContent(en['duplicates.confirm']);
    fireEvent.click(screen.getByRole('button', { name: en['duplicates.confirmButton'] }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/review/older'));
    const posts = fetcher.mock.calls.filter((c) => c[1]?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0][1]!.body as string)).toEqual({ pairId: 'pair', resolution: 'merged' });
  });
});
