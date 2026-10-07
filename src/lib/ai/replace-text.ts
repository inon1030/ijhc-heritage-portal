import type { AnalysisResult } from './types';
import { fieldDef } from '@/lib/fields/registry';
import type { Draft, PreReviewEntry } from '@/components/pre-review';

/** Text edited by a contributor, kept separately from the original AI answer. */
export type ContributorText = Pick<AnalysisResult, 'summary' | 'background' | 'keywords' | 'backgroundSources'>;

/** Existing storage limits still apply after a bulk correction. */
export function replacementFits(drafts: Record<string, Draft>): boolean {
  return Object.values(drafts).every((draft) =>
    draft.title.length <= 200 && draft.description.length <= 4000 &&
    draft.keywords.every((word) => word.length > 0 && word.length <= 60) &&
    draft.fields.every((field) => field.value.length <= (fieldDef(field.key)?.maxLength ?? 2000) &&
      (field.note?.length ?? 0) <= 400) &&
    (draft.reading?.ocrText?.length ?? 0) <= 20000 &&
    (draft.reading?.transcript?.length ?? 0) <= 100000 &&
    (!draft.contributorText || (draft.contributorText.summary.length <= 4000 &&
      (draft.contributorText.background?.length ?? 0) <= 12000 &&
      draft.contributorText.keywords.every((word) => word.length <= 200) &&
      draft.contributorText.backgroundSources.every((source) => source.title.length <= 400))),
  );
}

/** Read only the contributor copy; never silently substitute it for the AI answer. */
export function contributorTextOf(raw: unknown): ContributorText | null {
  if (!raw || typeof raw !== 'object' || !('contributorText' in raw)) return null;
  const text = raw.contributorText as Partial<ContributorText> | null;
  if (!text || typeof text.summary !== 'string' || !(text.background === null || typeof text.background === 'string') ||
    !Array.isArray(text.keywords) || !text.keywords.every((word) => typeof word === 'string') ||
    !Array.isArray(text.backgroundSources) || !text.backgroundSources.every((source) =>
      source && typeof source.title === 'string' && typeof source.url === 'string' && /^https?:\/\//.test(source.url))) return null;
  return text as ContributorText;
}

/** Unicode word boundaries: Hebrew letters/marks are not Latin regex \b. */
export function replaceWholeWord(text: string, find: string, replacement: string) {
  const word = find.trim();
  if (!word) return { text, count: 0 };
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])${escaped}(?![\\p{L}\\p{N}\\p{M}_])`, /[\u0590-\u05ff]/u.test(word) ? 'gu' : 'giu');
  let count = 0;
  const result = text.replace(pattern, (match) => {
    if (match !== replacement) count++;
    return replacement; // Literal replacement: $&, $1 and backslashes are text.
  });
  return { text: result, count };
}

/** Count changed text blocks, not words, without touching ids, URLs or the AI answer. */
export function replaceReviewText(entries: PreReviewEntry[], drafts: Record<string, Draft>, find: string, replacement: string) {
  let count = 0;
  const change = (text: string) => {
    const result = replaceWholeWord(text, find, replacement);
    if (result.count) count++;
    return result.text;
  };
  const result = { ...drafts };
  for (const entry of entries) {
    const draft = drafts[entry.id];
    const analysis = entry.analysis;
    if (!draft) continue;
    const before = count;
    const text = draft.contributorText ?? analysis;
    const contributorText: ContributorText | undefined = text ? {
      summary: change(text.summary),
      background: text.background === null ? null : change(text.background),
      keywords: text.keywords.map(change),
      backgroundSources: text.backgroundSources.map((source) => ({ ...source, title: change(source.title) })),
    } : undefined;
    const reading = { ...draft.reading };
    for (const key of ['ocrText', 'transcript'] as const) {
      const current = reading[key] ?? analysis?.[key] ?? null;
      if (current !== null) {
        const updated = change(current);
        if (updated !== current) reading[key] = updated;
      }
    }
    const next: Draft = {
      ...draft,
      title: change(draft.title),
      description: change(draft.description),
      keywords: draft.keywords.map(change),
      fields: draft.fields.map((field) => {
        // Enum/facet values are catalogue identifiers, not the model's prose.
        const value = fieldDef(field.key)?.type === 'text' ? change(field.value) : field.value;
        const note = field.note == null ? field.note : change(field.note);
        const suggested = field.suggested == null || fieldDef(field.key)?.type !== 'text'
          ? field.suggested : change(field.suggested);
        return value !== field.value || note !== field.note || suggested !== field.suggested
          ? { ...field, value, note, suggested, source: 'contributor' } : field;
      }),
      reading,
      contributorText,
    };
    if (count > before) result[entry.id] = next;
  }
  return { drafts: result, count };
}
