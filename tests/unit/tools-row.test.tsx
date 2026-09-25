import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/review', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/i18n/provider', () => ({ useMessages: () => (key: string) => key }));
vi.mock('@/components/site-nav', () => ({
  PrimaryNav: () => null,
  AccountNav: () => null,
  PendingNotice: () => null,
  ArchiveNav: () => <a href="#queue">queue</a>,
}));

import { MastheadShell, ROW_FOLD_MS } from '@/components/masthead-shell';

/**
 * The knowledge expert's tools row (Inon, 25.09.2026): it folds four seconds
 * after it opens, a click on it pins it open, and another click lets it fold
 * after four seconds again.
 */
const admin = { id: 'a', role: 'admin', email: 'a@x.org' } as never;

function renderShell() {
  render(<MastheadShell home={null} rule={null} language={null} profile={admin} queueCount={0} />);
  const row = screen.getByText('queue').closest('div.grid') as HTMLElement;
  const isOpen = () => row.className.includes('opacity-100');
  return { row, isOpen };
}

describe('the tools row', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('folds four seconds after it opens', () => {
    const { isOpen } = renderShell();
    expect(ROW_FOLD_MS).toBe(4000);
    expect(isOpen()).toBe(true);
    act(() => vi.advanceTimersByTime(3900));
    expect(isOpen()).toBe(true);
    act(() => vi.advanceTimersByTime(200));
    expect(isOpen()).toBe(false);
  });

  it('stays open once clicked, and folds four seconds after a second click', () => {
    const { row, isOpen } = renderShell();
    fireEvent.click(row);
    act(() => vi.advanceTimersByTime(60_000));
    expect(isOpen()).toBe(true);

    fireEvent.click(row);
    act(() => vi.advanceTimersByTime(3900));
    expect(isOpen()).toBe(true);
    act(() => vi.advanceTimersByTime(200));
    expect(isOpen()).toBe(false);
  });

  it('is not pinned by following one of its links', () => {
    const { isOpen } = renderShell();
    fireEvent.click(screen.getByText('queue'));
    act(() => vi.advanceTimersByTime(4100));
    expect(isOpen()).toBe(false);
  });

  it('is pinned by its pin button too', () => {
    const { isOpen } = renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'nav.pinRow' }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(isOpen()).toBe(true);
    expect(screen.getByRole('button', { name: 'nav.unpinRow' })).toHaveAttribute('aria-pressed', 'true');
  });
});
