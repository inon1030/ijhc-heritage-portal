import type { AccessLevel } from '@/lib/types';

/**
 * Who a record is for — the Stakeholders domain of the logical tree, in the one
 * place it actually belongs.
 *
 * Erez's tree has a Stakeholders branch: Community (families, culture leaders,
 * second and third generations), Public and Education (general public, tourists
 * and influencers, education programmes), Academic (researchers, mapping,
 * language). Catalogued on a record as a field it would be nonsense — an item
 * is not "Researchers". But it is not nonsense as a *question about the record*:
 * who should be able to see this. And the archive already had a column for that
 * answer, unused, since the first migration.
 *
 * So the four access levels are the three stakeholder groups plus the archive
 * itself, and the labels are written as the audience rather than as a
 * permission, because "Families and the community" is a sentence a volunteer
 * can act on and "restricted" is not.
 *
 * ─── What this does today, and what it does not ──────────────────────────────
 *
 * `public` is the only level an anonymous visitor can read; RLS has enforced
 * that since 0002 and nothing here changes it. The other three are visible to
 * volunteers, and **only** to volunteers: there is no sign-in for a family
 * member or a researcher yet, so choosing "Researchers" today records the
 * intention and withholds the record from the public portal. It does not open a
 * door to researchers, because that door is Stage 2.
 *
 * That is worth being plain about on screen. A reviewer who believes they have
 * granted access to a group that cannot in fact reach it has been misled by
 * their own tool.
 */

export interface AccessOption {
  value: AccessLevel;
  /** Who it is for, in the words the tree uses. */
  label: string;
  /** The stakeholder branch it answers, or the archive itself. */
  stakeholders: string;
  /** What actually happens when it is chosen. Never a promise the system cannot keep. */
  effect: string;
}

export const ACCESS_OPTIONS: readonly AccessOption[] = [
  {
    value: 'public',
    label: 'Everyone',
    stakeholders: 'General public · Tourists and influencers · Education programs',
    effect: 'Published in the portal. Anyone can find it, link to it, and read it.',
  },
  {
    value: 'restricted',
    label: 'The community',
    stakeholders: 'Families · Culture leaders · 2nd and 3rd generations',
    effect: 'Kept out of the public portal. Volunteers only, until community sign-in exists.',
  },
  {
    value: 'research',
    label: 'Researchers',
    stakeholders: 'Researchers · Mapping · Language',
    effect: 'Kept out of the public portal. Volunteers only, until researcher sign-in exists.',
  },
  {
    value: 'administrative',
    label: 'The archive only',
    stakeholders: 'Not a stakeholder group — the Center’s own working material',
    effect: 'Never shown outside the review screens.',
  },
] as const;

export const ACCESS_LABELS: Record<AccessLevel, string> = Object.fromEntries(
  ACCESS_OPTIONS.map((o) => [o.value, o.label]),
) as Record<AccessLevel, string>;

export function accessOption(value: AccessLevel): AccessOption {
  return ACCESS_OPTIONS.find((o) => o.value === value) ?? ACCESS_OPTIONS[0];
}

/** The levels that are held back from the public portal. */
export const WITHHELD: AccessLevel[] = ['restricted', 'research', 'administrative'];

export const ACCESS_LEVELS = ACCESS_OPTIONS.map((o) => o.value);
