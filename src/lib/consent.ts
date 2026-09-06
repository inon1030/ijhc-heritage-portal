/**
 * What a contributor is told before they send something, in one place.
 *
 * Three rules govern this file:
 *
 * 1. **It describes what the system actually does.** Every clause below is
 *    checkable against the code. If the behaviour changes, this text is part of
 *    the change, not a document that drifts away from it.
 *
 * 2. **Versions are never edited in place.** `CONSENT_VERSION` is stamped on
 *    every record at submission (migration 0010). Rewriting a version's wording
 *    would silently rewrite what past contributors are recorded as having
 *    agreed to. A change means a new entry and a new version string.
 *
 *    Known gap: only the current version's wording is held here. A record
 *    stamped `2026-08-27b` links to today's text, so the archive can say
 *    *which* version somebody agreed to but cannot show them what it said.
 *    Keeping past wordings is the fix, and five versions now exist:
 *    `2026-08-27b`, then four in two days as the archive's own behaviour
 *    changed under it. Two of them contradict each other — `2026-09-02` said
 *    volunteers could not read a contributor's address and `2026-09-02b` says
 *    they can. Checked against the live database: every stamped record carries
 *    `2026-08-27b` and nothing was submitted under any later version, so no
 *    contributor is pointed at wording that contradicts what they agreed to.
 *    That is luck rather than design, and it runs out the first time somebody
 *    uploads between two bumps.
 *
 * 3. **It is plain language, not a legal instrument.** Nobody with a law degree
 *    has read it. An archive that publishes family material under an
 *    institution's name, in a jurisdiction with a privacy statute, should have
 *    one do so. Noted in `../PILOT WITH EREZ/09 — Open Questions.md`.
 */

export const CONSENT_VERSION = '2026-09-03';

/**
 * The address someone writes to in order to withdraw material or ask what is
 * held about them.
 *
 * Deliberately not hard-coded and deliberately not invented: it is the Heritage
 * Center's own address and nobody has given it to us. Until `ARCHIVE_CONTACT`
 * is set, the notice says plainly that the address is not published yet rather
 * than pointing at something that does not receive mail — a withdrawal route
 * that goes nowhere is worse than an admitted gap.
 */
export const contactAddress = (): string | null =>
  process.env.NEXT_PUBLIC_ARCHIVE_CONTACT?.trim() || null;

/** The one line beside the tick box. Everything else expands from it. */
export const CONSENT_SUMMARY =
  'I may share this material with the Indian Jewish Heritage Center, and I agree to how it will be handled.';

export interface ConsentClause {
  /**
   * The catalogue prefix for this clause: `<key>.heading`, `<key>.p1`, `<key>.p2`.
   *
   * The English below stays the version of record. It is what `consentVersion`
   * on a submission points at, and what a translated page links back to; the
   * keys exist only so a contributor can read the terms in a language they
   * actually read before ticking the box.
   */
  key: string;
  heading: string;
  body: string[];
}

export const CONSENT_CLAUSES: ConsentClause[] = [
  {
    key: 'consent.c1',
    heading: 'What happens to what you send',
    body: [
      'A volunteer reads it and checks it against the file before anything appears in public. Until then it is visible only to volunteers of the Heritage Center.',
      'If it is accepted, the material and the description are published on this site under the Center’s name, and anyone can see them. If it is not accepted, it normally stays in the archive as an unpublished record rather than being deleted, so that a decision can be revisited — but see what the Center may do without asking you, below.',
    ],
  },
  {
    key: 'consent.c2',
    heading: 'The machine reading',
    body: [
      'An automated system reads the file and suggests a description, a period, a place, and keywords. Everything it produces is a suggestion. A person decides what becomes the record.',
      'To do that, the file is sent to Google’s Gemini service, outside the Center.',
      'The archive currently uses that service on its free tier. Under Google’s terms for unpaid use, material sent there may be reviewed by people at Google and used to improve their products. A paid account carries the opposite undertaking.',
      'So: if the material is private, or shows a living person, or you would rather it were not seen outside the Center, do not upload it here. Contact the Center and it will be taken in by hand.',
    ],
  },
  {
    key: 'consent.c3',
    heading: 'Your name and email address, if you give them',
    body: [
      'Both are optional. Leaving them blank does not change how your contribution is treated.',
      'Neither is published, and the address is not an account: it grants no access to anything, and nobody can retrieve your uploads by typing it.',
      'The volunteers who catalogue the archive can see both. That is how somebody comes back to you with a question, how several contributions from you are kept together, and how a volunteer records that an address belongs to a particular family — which is often what allows old material to be placed at all.',
      'A family name recorded against your address is not published by that alone. Family names appear on a record only when a volunteer decides the family belongs on it.',
      'Neither is used for a newsletter, passed to anyone outside the Center, or sold.',
    ],
  },
  {
    key: 'consent.c4',
    heading: 'Names of people',
    body: [
      'Family names attached to a record are published with it — that is what makes a heritage archive usable, and it means the surnames of living relatives can appear in public.',
      'Do not send material that names or shows a living person without their agreement. If you are unsure, say so in the description; a volunteer will hold it rather than publish it.',
    ],
  },
  {
    key: 'consent.c5',
    heading: 'Rights in the material',
    body: [
      'Sending something here does not transfer its ownership. You are confirming that it is yours to share, or that you have permission from whoever it belongs to.',
      'You are giving the Heritage Center permission to keep it, describe it, and publish it as part of the archive.',
    ],
  },
  {
    key: 'consent.c6',
    heading: 'Following what you sent',
    body: [
      'At the end of an upload you are given a link, one for each contribution. It shows you whether a volunteer has published it yet, and it does not expire.',
      'It needs no account and no password, so keep it somewhere you will find it — the Center cannot send you another unless it has your address.',
      'Anyone holding that link can see the same page, so treat it the way you would treat the material itself.',
    ],
  },
  {
    key: 'consent.c7',
    heading: 'What the Center may do without asking you',
    body: [
      'The Heritage Center decides what the archive holds. It may decline your contribution, take a published record out of public view, or remove material entirely, at its own discretion and without telling you first.',
      'It does not need a reason it has to give you, and it does not undertake to notify you when it does. Volunteers are cataloguing donated material against limited time, and a duty to write to every contributor before every decision would mean the decisions do not get made.',
      'What is kept is a note that the item existed, so the same thing is not accepted again later by mistake.',
      'This does not affect the two requests below. Those are yours to make, and the Center answers them.',
    ],
  },
  {
    key: 'consent.c8',
    heading: 'Changing your mind',
    body: [
      'You can ask for material to be taken down, or ask what is held about you, at any time.',
      'You can also ask to be forgotten without withdrawing what you sent. Your name and address are erased and the material stays in the archive, no longer linked to a person. The two are separate requests and you can make either one.',
    ],
  },
];

/**
 * The withdrawal paragraph, which depends on whether the Center's address has
 * been supplied. Kept out of `CONSENT_CLAUSES` because it is the one part that
 * is not the same for every reader.
 */
export function contactSentence(): string {
  const address = contactAddress();
  return address
    ? `Write to ${address}.`
    : 'The Heritage Center has not yet published a contact address for this. Until it does, ask the volunteer who was in touch with you — and if nobody has been, the address will appear here as soon as the Center provides one.';
}
