import { FIELD_GROUPS, GROUP_ORDER, fieldDef, type FieldGroupKey } from '@/lib/fields/registry';
import type { Community, Keyword } from '@/lib/types';

/**
 * The vocabulary, shaped the way it is actually used.
 *
 * Deliberately pure — no database, no `server-only` — because this is where the
 * rules live that everything else depends on, and rules you cannot test in
 * isolation are rules nobody checks.
 *
 * Two ideas, and every function here is one of them:
 *
 *   **A term has one preferred spelling and any number of variants.** Records
 *   store the preferred one, always. A person may search, type, or pick a
 *   variant and land on the same term, which is what stops `Bombay` and
 *   `Mumbai` from becoming two halves of a collection.
 *
 *   **A term hangs off a branch of the logical tree.** Not a free-floating
 *   label: `Alibag` subdivides *Cities and Villages*, `Purim` subdivides
 *   *Traditions*. That is what makes the vocabulary joinable to everything else
 *   the archive records, because the branch is the same key `item_fields` uses.
 */

export interface VocabularyTerm {
  id: string;
  term: string;
  /** Other ways of writing the same thing. Never stored on a record. */
  variants: string[];
  /** The branch of the tree this term subdivides. Null while unplaced. */
  branchKey: string | null;
  community: Community | null;
  /** An outside authority id, for joining this archive to other data. */
  externalId: string | null;
}

export interface VocabularyBranch {
  branchKey: string;
  /** The branch's own label from the registry — "Cities and Villages". */
  label: string;
  /** The catalogue it belongs to — "Communities Mapping". */
  catalogue: string;
  group: FieldGroupKey;
  terms: VocabularyTerm[];
}

/**
 * Rows as they come out of the table, nested.
 *
 * A variant whose preferred term is missing — which the schema makes
 * impossible, and which a hand-edited database could still produce — is
 * promoted to a term of its own rather than silently dropped. Losing a
 * cataloguer's word is worse than showing one that lost its parent.
 */
export function buildVocabulary(rows: Keyword[]): VocabularyTerm[] {
  const preferred = new Map<string, VocabularyTerm>();

  for (const row of rows) {
    if (row.preferred_id) continue;
    preferred.set(row.id, {
      id: row.id,
      term: row.term,
      variants: [],
      branchKey: row.branch_key,
      community: row.community,
      externalId: row.external_id,
    });
  }

  for (const row of rows) {
    if (!row.preferred_id) continue;
    const parent = preferred.get(row.preferred_id);
    if (parent) {
      parent.variants.push(row.term);
    } else {
      preferred.set(row.id, {
        id: row.id,
        term: row.term,
        variants: [],
        branchKey: row.branch_key,
        community: row.community,
        externalId: row.external_id,
      });
    }
  }

  return [...preferred.values()]
    .map((t) => ({ ...t, variants: [...t.variants].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.term.localeCompare(b.term));
}

/**
 * The terms offered for one community: those scoped to it, plus every global
 * term. Unchanged in meaning from the flat version — a term scoped to Cochin
 * has no business being offered on a Baghdadi record.
 */
export function termsFor(terms: VocabularyTerm[], community: Community | null): VocabularyTerm[] {
  return terms.filter((t) => t.community === null || (community !== null && t.community === community));
}

/**
 * Grouped under the branches of the tree, in the tree's own order.
 *
 * Only branches that hold something appear. An empty heading is a question the
 * cataloguer failed to answer, and there are forty-one branches — showing all
 * of them empty would bury the eleven that are in use.
 */
export function byBranch(terms: VocabularyTerm[]): VocabularyBranch[] {
  const held = new Map<string, VocabularyTerm[]>();

  for (const term of terms) {
    if (!term.branchKey) continue;
    held.set(term.branchKey, [...(held.get(term.branchKey) ?? []), term]);
  }

  const branches: VocabularyBranch[] = [];

  for (const group of GROUP_ORDER) {
    for (const [branchKey, rows] of held) {
      const def = fieldDef(branchKey);
      if (!def || def.group !== group) continue;
      branches.push({
        branchKey,
        label: def.label,
        catalogue: FIELD_GROUPS[group].blurb,
        group,
        terms: rows.sort((a, b) => a.term.localeCompare(b.term)),
      });
    }
  }

  // A term whose branch the registry no longer defines keeps its value and
  // shows up here rather than vanishing, the same way item_fields does.
  for (const [branchKey, rows] of held) {
    if (!fieldDef(branchKey)) {
      branches.push({
        branchKey,
        label: branchKey,
        catalogue: 'No longer in the tree',
        group: 'record',
        terms: rows,
      });
    }
  }

  return branches;
}

/** Terms with no branch yet. They are the manager's to-do list. */
export function unplaced(terms: VocabularyTerm[]): VocabularyTerm[] {
  return terms.filter((t) => !t.branchKey);
}

/**
 * What a record should store, given whatever was typed or chosen.
 *
 * The single rule the whole thesaurus exists to enforce: a variant resolves to
 * its preferred spelling, matching is case- and space-insensitive, and anything
 * the vocabulary does not hold is dropped rather than written.
 *
 * Dropped, not rejected: this runs on the review save where a stale browser tab
 * can easily hold a term an administrator has just removed, and failing the
 * whole save over one word would lose a volunteer's work.
 */
export function resolveTerms(terms: VocabularyTerm[], chosen: string[]): string[] {
  const index = new Map<string, string>();
  for (const term of terms) {
    index.set(normalise(term.term), term.term);
    for (const variant of term.variants) index.set(normalise(variant), term.term);
  }

  const resolved: string[] = [];
  for (const raw of chosen) {
    const hit = index.get(normalise(raw));
    if (hit && !resolved.includes(hit)) resolved.push(hit);
  }
  return resolved;
}

/** Is this word already in the vocabulary under any spelling? */
export function isKnown(terms: VocabularyTerm[], word: string): boolean {
  const target = normalise(word);
  return terms.some(
    (t) => normalise(t.term) === target || t.variants.some((v) => normalise(v) === target),
  );
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}
