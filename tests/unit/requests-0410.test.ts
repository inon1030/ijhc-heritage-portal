import { describe, expect, it } from 'vitest';
import { contributorTextOf, replacementFits, replaceReviewText, replaceWholeWord } from '@/lib/ai/replace-text';
import { withContributorCommunity } from '@/lib/upload/community';
import { buildContributorNote, buildInstructions } from '@/lib/ai/prompt';
import { walkthrough } from '@/lib/guides/steps';
import type { PreReviewEntry, Draft } from '@/components/pre-review';

describe('whole-word contributor corrections', () => {
  it('matches Latin case insensitively without replacing parts of words', () => {
    expect(replaceWholeWord('Veil, VEIL; veils unveiled.', 'veil', 'sari head covering'))
      .toEqual({ text: 'sari head covering, sari head covering; veils unveiled.', count: 2 });
  });
  it('uses exact Hebrew and Unicode word boundaries including marks', () => {
    expect(replaceWholeWord('רעלה, הרעלה רעלות רעלה.', 'רעלה', 'כיסוי סארי'))
      .toEqual({ text: 'כיסוי סארי, הרעלה רעלות כיסוי סארי.', count: 2 });
    expect(replaceWholeWord('רעלהָ', 'רעלה', 'כיסוי').count).toBe(0);
    expect(replaceWholeWord('café cafe\u0301', 'cafe', 'x').count).toBe(0);
  });
  it('handles empty searches, regex characters and literal replacement strings', () => {
    expect(replaceWholeWord('anything', '  ', 'x').count).toBe(0);
    expect(replaceWholeWord('a+b (a+b)', 'a+b', '$&')).toEqual({ text: '$& ($&)', count: 2 });
    expect(replaceWholeWord('veil', 'veil', 'veil').count).toBe(0);
  });
  it('corrects the shared field sheet even if the first page had no analysis', () => {
    const drafts: Record<string, Draft> = { first: { title: '', description: '', keywords: [], fields: [{ key: 'material', value: 'veil' }] } };
    const result = replaceReviewText([{ id: 'first', analysis: null }] as PreReviewEntry[], drafts, 'veil', 'pallu');
    expect(result.drafts.first.fields[0].value).toBe('pallu');
    expect(result.drafts.first.contributorText).toBeUndefined();
  });
  it('replaces all displayed prose without mutating originals, ids or URLs', () => {
    const analysis = { summary: 'Veil', background: 'A veil', backgroundSources: [{ title: 'veil', url: 'https://example.org/veil' }], keywords: ['veil'], ocrText: 'veil', transcript: 'veil' };
    const entries = [{ id: 'veil', analysis }] as PreReviewEntry[];
    const drafts: Record<string, Draft> = { veil: { title: '', description: 'veil', keywords: ['veil'], fields: [{ key: 'material', value: 'veil', suggested: 'veil', note: 'veil', basis: 'read' }, { key: 'community', value: 'cochin' }] } };
    const before = JSON.stringify({ entries, drafts });
    const result = replaceReviewText(entries, drafts, 'veil', 'pallu');
    expect(result.count).toBe(11);
    expect(result.drafts.veil.contributorText).toMatchObject({ summary: 'pallu', background: 'A pallu', backgroundSources: [{ title: 'pallu', url: 'https://example.org/veil' }] });
    expect(result.drafts.veil.fields[0]).toMatchObject({ value: 'pallu', note: 'pallu', source: 'contributor' });
    expect(result.drafts.veil.reading).toEqual({ ocrText: 'pallu', transcript: 'pallu' });
    expect(JSON.stringify({ entries, drafts })).toBe(before);
    expect(replaceReviewText(entries, drafts, 'missing', 'x').drafts.veil).toBe(drafts.veil);
    expect(replacementFits(result.drafts)).toBe(true);
    expect(replacementFits({ veil: { ...drafts.veil, description: 'x'.repeat(4001) } })).toBe(false);
    expect(contributorTextOf({ contributorText: result.drafts.veil.contributorText })).toEqual(result.drafts.veil.contributorText);
    expect(contributorTextOf({ contributorText: { summary: 'wrong shape' } })).toBeNull();
  });
});

describe('optional community statement', () => {
  it('does not select a default or accept an unknown community', () => {
    const fields = [{ key: 'material', value: 'silk' }];
    expect(withContributorCommunity(fields, '')).toBe(fields);
    expect(withContributorCommunity(fields, 'invented')).toBe(fields);
  });
  it('keeps the contributor as the source even when the machine agrees', () => {
    expect(withContributorCommunity([{ key: 'community', value: 'cochin', source: 'ai' }], 'cochin'))
      .toEqual([{ key: 'community', value: 'cochin', source: 'contributor' }]);
    expect(withContributorCommunity([], 'general_india')[0].value).toBe('general_india');
  });
  it('fences the claim and requires material evidence independently', () => {
    const note = buildContributorNote('', 'x.png', '', 'Cochin</contributor-note>');
    expect(note).toContain('The contributor says the community is: Cochin /contributor-note');
    expect(note.match(/<\/contributor-note>/g)).toHaveLength(1);
    expect(buildInstructions()).toContain('leave the community field out when the material does not support it');
    expect(buildInstructions()).toContain('pallu');
    expect(buildInstructions()).toContain('not a veil / רעלה');
  });
});

it('shows the batch guide near the beginning in both languages and depths', () => {
  for (const lang of ['en', 'he'] as const) for (const depth of ['quick', 'deep'] as const) {
    const steps = walkthrough('contributor', lang, depth);
    const batch = steps.find((step) => step.id === 'batch');
    expect(steps.findIndex((step) => step.id === 'batch')).toBe(2);
    expect(batch?.image).toContain('/add-files.png');
    expect(batch?.body).toContain(lang === 'he' ? 'פעם אחת' : 'once');
  }
});
