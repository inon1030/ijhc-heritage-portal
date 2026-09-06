import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TranslationDeck } from '@/components/translation-deck';

/**
 * The panel a volunteer reads before publishing a record in five languages.
 *
 * The point of these tests is the three states, because the whole value of the
 * panel is that they look different. A translation that is *missing* is work
 * not yet done and the reader would see the English anyway. A translation that
 * is *stale* was made from text somebody has since rewritten — it reads as
 * finished while describing something that is no longer there, and it is the
 * one a volunteer must not skim past. A translation *corrected by hand* is a
 * person's own words, which the machine must never overwrite.
 *
 * The fetch is stubbed rather than the module: this is the component's contract
 * with the route, and a test that mocked a wrapper would pass while the two
 * drifted apart.
 */

const DECK = {
  languages: [
    { code: 'he', label_en: 'Hebrew', label_native: 'עברית', rtl: true },
    { code: 'ml', label_en: 'Malayalam', label_native: 'മലയാളം', rtl: false },
  ],
  fields: ['title', 'description'],
  itemLanguage: null,
  byLanguage: {
    he: [
      { field: 'title', source: 'A Torah ark curtain', value: 'פרוכת', by: 'human', stale: false },
      { field: 'description', source: 'Embroidered silk.', value: 'משי רקום.', by: 'machine', stale: true },
    ],
    ml: [
      { field: 'title', source: 'A Torah ark curtain', value: null, by: null, stale: false },
      { field: 'description', source: 'Embroidered silk.', value: 'എംബ്രോയിഡറി പട്ട്.', by: 'machine', stale: false },
    ],
  },
};

function stubFetch(deck: unknown = DECK) {
  const fetcher = vi.fn(async (_input?: unknown, _init?: RequestInit) =>
    new Response(JSON.stringify({ ok: true, data: deck }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

beforeEach(() => stubFetch());
afterEach(() => vi.unstubAllGlobals());

describe('the languages a record will be published in', () => {
  it('shows one tab per language with how much of it is done', async () => {
    render(<TranslationDeck itemId="abc" />);

    // Hebrew: two fields, one current and one stale, so one of two.
    expect(await screen.findByText('עברית')).toBeInTheDocument();
    expect(screen.getByText('മലയാളം')).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveTextContent('1/2');
    expect(tabs[1]).toHaveTextContent('1/2');
  });

  it('marks a stale translation, because it is the one that reads as finished', async () => {
    render(<TranslationDeck itemId="abc" />);
    expect(await screen.findByText('made from older text')).toBeInTheDocument();
  });

  it("marks a volunteer's own words so the next volunteer does not take them for the machine's", async () => {
    render(<TranslationDeck itemId="abc" />);
    expect(await screen.findByText('corrected by hand')).toBeInTheDocument();
  });

  it('shows the English above every box, because checking without it is guessing', async () => {
    render(<TranslationDeck itemId="abc" />);
    expect(await screen.findByText('A Torah ark curtain')).toBeInTheDocument();
    expect(screen.getByText('Embroidered silk.')).toBeInTheDocument();
  });

  it('says which fields have nothing yet', async () => {
    const user = userEvent.setup();
    render(<TranslationDeck itemId="abc" />);
    await user.click(await screen.findByText('മലയാളം'));
    expect(await screen.findByText('not translated yet')).toBeInTheDocument();
  });

  it('sets the direction and language of each box from the language, not the page', async () => {
    // A Hebrew box inside an English page has to carry its own `dir`, or the
    // volunteer types right-to-left text into a left-to-right field and cannot
    // tell where the cursor is.
    render(<TranslationDeck itemId="abc" />);
    const boxes = await screen.findAllByRole('textbox');
    expect(boxes[0]).toHaveAttribute('dir', 'rtl');
    expect(boxes[0]).toHaveAttribute('lang', 'he');
  });

  it('does not translate on mount — that would spend the day on a skim', async () => {
    // Four calls per record against an allowance of twenty a day. Opening five
    // records to look at them would exhaust it before anything was published.
    const fetcher = stubFetch();
    render(<TranslationDeck itemId="abc" />);
    await screen.findByText('עברית');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.every((call) => !call[1]?.method)).toBe(true);
  });

  it('offers to save only once something has actually been changed', async () => {
    const user = userEvent.setup();
    render(<TranslationDeck itemId="abc" />);
    await screen.findByText('עברית');
    expect(screen.queryByText('Save correction')).not.toBeInTheDocument();

    const boxes = screen.getAllByRole('textbox');
    await user.type(boxes[0], '!');
    await waitFor(() => expect(screen.getByText('Save correction')).toBeInTheDocument());
  });
});
