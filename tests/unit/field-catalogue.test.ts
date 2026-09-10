import { describe, expect, it } from 'vitest';
import { en } from '@/lib/i18n/messages';
import { FIELDS, FIELD_GROUPS, GROUP_ORDER } from '@/lib/fields/registry';
import {
  basisKey,
  fieldHintKey,
  fieldLabelKey,
  groupBlurbKey,
  groupLabelKey,
} from '@/lib/fields/labels';
import { EVIDENCE_BASIS_LABELS, type EvidenceBasis } from '@/lib/types';

/**
 * The tree says the same thing in both places, or the build stops.
 *
 * A field's name lives twice on purpose. The registry's copy is the **stored
 * value** — adding "Temples" writes `Temples` into `item_fields.value`, the
 * portal filters on it and an export reads as English — and the catalogue's is
 * what is **drawn on a screen**, where English in front of a Malayalam reader
 * is simply wrong.
 *
 * Two copies of a string is a drift waiting to happen, and drift here is the
 * quiet kind: renaming a field in the registry and forgetting the catalogue
 * leaves a page that still renders, in a language nobody on this side of the
 * archive reads, saying the old name. So they are pinned together, and adding a
 * field without its catalogue entry fails here rather than in Cochin.
 */

describe('the logical tree and the catalogue', () => {
  it('has a label for every field, and the same one', () => {
    const missing: string[] = [];
    const different: string[] = [];

    for (const field of FIELDS) {
      const held = (en as Record<string, string>)[fieldLabelKey(field.key)];
      if (held === undefined) missing.push(field.key);
      else if (held !== field.label) different.push(`${field.key}: "${held}" vs "${field.label}"`);
    }

    expect(missing).toEqual([]);
    expect(different).toEqual([]);
  });

  it('has a hint for every field that carries one of its own', () => {
    // A facet's hint is generated from its path — "Filed under …" — and is
    // composed at render time from one translated frame, so it deliberately
    // has no key. Every other field's hint is prose and must have one.
    const missing = FIELDS.filter(
      (field) =>
        field.hint &&
        !field.hint.startsWith('Filed under ') &&
        (en as Record<string, string>)[fieldHintKey(field.key)] !== field.hint,
    ).map((field) => field.key);

    expect(missing).toEqual([]);
  });

  it('has the frame the facets share', () => {
    expect(en['fields.filedUnder']).toContain('{path}');
  });

  it('has a name and a blurb for every group', () => {
    for (const group of GROUP_ORDER) {
      expect((en as Record<string, string>)[groupLabelKey(group)]).toBe(FIELD_GROUPS[group].label);
      expect((en as Record<string, string>)[groupBlurbKey(group)]).toBe(FIELD_GROUPS[group].blurb);
    }
  });

  it('has all three bases', () => {
    for (const basis of ['read', 'inferred', 'guess'] as EvidenceBasis[]) {
      expect((en as Record<string, string>)[basisKey(basis)]).toBe(EVIDENCE_BASIS_LABELS[basis]);
    }
  });

  it('names every group in GROUP_ORDER exactly once', () => {
    // Not about translation — about the catalogue check above being complete.
    // A group missing from the order would be silently unchecked.
    expect([...GROUP_ORDER].sort()).toEqual(Object.keys(FIELD_GROUPS).sort());
  });
});
