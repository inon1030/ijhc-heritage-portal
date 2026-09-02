import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StreamSummary } from '@/components/stream-summary';
import type { Community } from '@/lib/types';

/**
 * The four-stream block, and the number it puts under each one.
 *
 * Found in preflight: with nine records published the block showed Baghdadi at
 * "71% of the archive" — which is 5/7, because the denominator is the four
 * founding streams and General India is deliberately outside them. The
 * denominator was right; the word "archive" was wrong, and it contradicted the
 * "9 records published" line two rows above it on the same screen.
 *
 * These tests pin both halves: the share is measured against the four, and the
 * label says so.
 */

const counts = (over: Partial<Record<Community, number>> = {}): Record<Community, number> => ({
  bene_israel: 0,
  cochin: 0,
  baghdadi: 0,
  bnei_menashe: 0,
  general_india: 0,
  ...over,
});

describe('the four-stream summary', () => {
  it('measures each share against the four streams, not the whole archive', () => {
    // The exact live shape when this was found: nine published, two of them
    // General India. Baghdadi is five of the seven that are in a founding
    // stream, and that is what the card must say.
    render(
      <StreamSummary
        counts={counts({ bene_israel: 1, cochin: 1, baghdadi: 5, general_india: 2 })}
      />,
    );

    expect(screen.getByText('71% of the four streams')).toBeInTheDocument();
    // The failing state: 5/9 rounded, i.e. someone "fixing" it by changing the
    // denominator instead of the label.
    expect(screen.queryByText('56% of the four streams')).not.toBeInTheDocument();
  });

  it('never calls the four streams "the archive"', () => {
    // The regression itself. If the word comes back, the page contradicts its
    // own record count again.
    const { container } = render(
      <StreamSummary counts={counts({ bene_israel: 1, baghdadi: 3, general_india: 5 })} />,
    );
    expect(container.textContent).not.toMatch(/of the archive/i);
  });

  it('shows the four founding streams and never General India', () => {
    render(<StreamSummary counts={counts({ bene_israel: 1, general_india: 9 })} />);

    for (const stream of ['Bene Israel', 'Cochin', 'Baghdadi', 'Bnei Menashe']) {
      expect(screen.getByText(stream)).toBeInTheDocument();
    }
    expect(screen.queryByText('General India')).not.toBeInTheDocument();
  });

  it('says "none yet" rather than dividing by zero on an empty archive', () => {
    render(<StreamSummary counts={counts()} />);
    expect(screen.getAllByText('none yet')).toHaveLength(4);
  });
});
