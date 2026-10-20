import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TagPicker } from '@/components/pre-review';
import { RecordFeedback } from '@/components/record-feedback';
import { CollectorFields } from '@/components/collector-fields';
import { MessagesProvider } from '@/lib/i18n/provider';
import he from '@/lib/i18n/locales/he.json';
import { en } from '@/lib/i18n/messages';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { CorrectionDecision } from '@/components/correction-decision';
import { CorrectionObjection } from '@/components/correction-objection';
import { CollectorCreditEditor } from '@/components/collector-credit-editor';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());

it('searches variants and Hebrew labels without suggesting an existing spelling again', () => {
  const change = vi.fn();
  render(<TagPicker chosen={[]} offered={[{ term: 'Mumbai', variants: ['Bombay', 'מומבאי'] }]} suggested={[]} onChange={change} />);
  fireEvent.change(screen.getByLabelText(en['prereview.addTag']), { target: { value: 'מומבאי' } });
  expect(screen.getByRole('button', { name: /Mumbai/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Suggest a new tag/ })).toBeNull();
  fireEvent.change(screen.getByLabelText(en['prereview.addTag']), { target: { value: 'Family album' } });
  fireEvent.click(screen.getByRole('button', { name: 'Suggest a new tag: Family album' }));
  expect(change).toHaveBeenCalledWith(['Family album']);
});

it('discards identity inputs for an anonymous public comment and never renders an email', async () => {
  const fetcher = vi.fn(async () => ({ json: async () => ({ ok: true }) }));
  vi.stubGlobal('fetch', fetcher);
  render(<RecordFeedback itemId="one" token="signed" fields={[]} expert={false} comments={[]} />);
  const form = screen.getAllByRole('button', { name: 'Submit' })[0].closest('form')!;
  fireEvent.click(form.querySelector('input[type=checkbox]')!);
  expect(form.querySelector('input[type=email]')).toBeNull();
  fireEvent.change(form.querySelector('textarea')!, { target: { value: 'A family memory' } });
  fireEvent.submit(form);
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  const payload = JSON.parse((fetcher.mock.calls[0] as unknown as [string, { body: string }])[1].body);
  expect(payload).toMatchObject({ anonymous: true, name: '', email: '', body: 'A family memory' });
  expect(await screen.findByText('Thank you. Your comment is now published.')).toBeInTheDocument();
});

it('provides Hebrew labels, a collector requirement hint, and deterministic offline visual fixtures', () => {
  const node = <MessagesProvider catalogue={he}><main className="mx-auto max-w-4xl px-6 py-10">
    <CollectorFields name="" required onName={() => {}} onRequired={() => {}} />
    <RecordFeedback itemId="one" token="signed" expert comments={[
      { id: 'one', anonymous: true, author_name: null, body: 'זיכרון משפחתי מהקהילה במומבאי. '.repeat(8), created_at: '2026-10-20T10:00:00Z' },
    ]} fields={[{ key: 'title', label: 'כותרת', value: 'הקהילה במומבאי', maxLength: 200 }]} />
  </main></MessagesProvider>;
  render(node);
  expect(screen.getByText(he['public.collectorRequired'])).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: he['public.collectorCredit'] })).toBeChecked();
  if (process.env.PHASE3_FIXTURES === '1') {
    fs.mkdirSync('docs/phase3-public-qa', { recursive: true });
    for (const [locale, catalogue] of [['he', he], ['en', en]] as const) {
      const fixture = <MessagesProvider catalogue={catalogue}><main className="mx-auto max-w-4xl px-6 py-10">
        <CollectorCreditEditor itemId="fixture" initialName="" initialRequired />
        <RecordFeedback itemId="fixture" token="fixture" locale={locale} expert comments={[
          { id: 'one', anonymous: true, author_name: null, body: (locale === 'he' ? 'זיכרון משפחתי מהקהילה במומבאי. ' : 'A family memory from the community in Mumbai. ').repeat(8), created_at: '2026-10-20T10:00:00Z' },
        ]} fields={[{ key: 'title', label: catalogue['public.title'], value: 'Mumbai', maxLength: 200 }]} />
        <section className="mt-8"><h2>{catalogue['public.corrections']}</h2><CorrectionDecision id="fixture" objectionAt="2026-10-20T10:00:00Z" /></section>
        <section className="mt-8"><h2>{catalogue['public.object']}</h2><CorrectionObjection id="fixture" token="fixture" /></section>
        <section className="mt-8"><TagPicker chosen={['A'.repeat(60)]} offered={[]} suggested={[]} onChange={() => {}} /></section>
      </main></MessagesProvider>;
      fs.writeFileSync(`docs/phase3-public-qa/feedback-${locale}.html`,
        `<!doctype html><html lang="${locale}" dir="${locale === 'he' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"></head><body>${renderToStaticMarkup(fixture)}</body></html>`);
    }
  }
});
