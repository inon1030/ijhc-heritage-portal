import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FieldSheet } from '@/components/field-sheet';
import { PreReview, type Draft, type PreReviewEntry } from '@/components/pre-review';
import type { FieldValue } from '@/lib/fields/registry';
import { MessagesProvider } from '@/lib/i18n/provider';
import he from '@/lib/i18n/locales/he.json';

function HebrewSheet() {
  const [values, setValues] = useState<FieldValue[]>([]);
  return <MessagesProvider catalogue={he}><div dir="rtl" style={{ width: 375 }}>
    <FieldSheet values={values} onChange={setValues} tone="contributor" includeBasics />
  </div></MessagesProvider>;
}

describe('Hebrew add field', () => {
  it('opens a list on click, adds the row, scrolls, focuses and announces it', () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    render(<HebrewSheet />);
    fireEvent.click(screen.getByText(he['fields.add']));
    const list = screen.getByRole('listbox');
    expect(list.closest('details')).toHaveAttribute('open');
    fireEvent.change(list, { target: { value: 'material' } });
    const input = screen.getByRole('textbox');
    expect(input.closest('[data-field-key]')).toHaveAttribute('data-field-key', 'material');
    expect(input).toHaveFocus();
    expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'instant' });
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('נוסף שדה');
    expect(list.closest('details')).not.toHaveAttribute('open');
  });
  it('focuses the remove control for a facet without an input', () => {
    render(<HebrewSheet />);
    fireEvent.click(screen.getByText(he['fields.add']));
    fireEvent.change(screen.getByRole('listbox'), { target: { value: 'domain.life.marriage' } });
    const row = document.querySelector('[data-field-key="domain.life.marriage"]') as HTMLElement;
    expect(within(row).getByRole('button')).toHaveFocus();
  });
});

const entry = {
  id: 'one', fileName: 'wedding.jpg', previewUrl: null, analysisError: null,
  metadata: { mimeType: 'image/jpeg', byteSize: 100 }, durationMs: null,
  path: 'x', grant: 'x', expiresAt: 1, translations: null,
  analysis: { summary: 'A veil', background: 'A veil on the head', keywords: [], fields: [],
    backgroundSources: [], ocrText: null, transcript: null },
} as unknown as PreReviewEntry;
function Review({ onSubmit = vi.fn(), submitting = false, blocked = false }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({ one: {
    title: '', description: 'A veil', keywords: [], fields: [{ key: 'material', value: 'silk', note: 'veil', basis: 'read', suggested: 'silk' }],
  } });
  return <PreReview entries={[entry]} drafts={drafts} onDraftChange={(id, draft) => setDrafts((old) => ({ ...old, [id]: draft }))}
    groups={[[entry.id]]} simulated hidden={false} onHiddenChange={vi.fn()} onSubmit={onSubmit}
    submitting={submitting} blocked={blocked} vocabulary={[]} languages={[]} rating={null} onRating={vi.fn()} />;
}
it('uses the same submission action and disabled state at both ends', () => {
  const submit = vi.fn();
  const { rerender } = render(<Review onSubmit={submit} />);
  const buttons = screen.getAllByRole('button', { name: 'Submit for review' });
  expect(buttons).toHaveLength(2);
  buttons.forEach((button) => fireEvent.click(button));
  expect(submit).toHaveBeenCalledTimes(2);
  rerender(<Review blocked />);
  screen.getAllByRole('button', { name: 'Submit for review' }).forEach((button) => expect(button).toBeDisabled());
  rerender(<Review submitting />);
  screen.getAllByRole('button', { name: /Submitting/ }).forEach((button) => expect(button).toBeDisabled());
});
it('offers replacement after an edit and applies summary, background and notes only on confirmation', () => {
  render(<Review />);
  fireEvent.change(screen.getByLabelText('Your description'), { target: { value: 'A pallu' } });
  fireEvent.change(screen.getByLabelText('Word to find'), { target: { value: 'veil' } });
  fireEvent.change(screen.getByLabelText('Replace with'), { target: { value: 'pallu' } });
  fireEvent.click(screen.getByRole('button', { name: 'Replace this word everywhere on this screen' }));
  expect(screen.getByText('A veil on the head')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Confirm replacement in/ }));
  expect(screen.getByText('A pallu on the head')).toBeInTheDocument();
  expect(screen.queryByText('A veil')).not.toBeInTheDocument();
  expect(screen.getByText('Text corrected by the contributor: pallu')).toBeInTheDocument();
});
