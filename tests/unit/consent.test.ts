import { afterEach, describe, expect, it } from 'vitest';
import {
  CONSENT_CLAUSES,
  CONSENT_SUMMARY,
  CONSENT_VERSION,
  contactAddress,
  contactSentence,
} from '@/lib/consent';

/**
 * The notice is a promise about behaviour, so these tests guard the parts that
 * would quietly stop being true.
 */

const original = process.env.NEXT_PUBLIC_ARCHIVE_CONTACT;

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_ARCHIVE_CONTACT;
  else process.env.NEXT_PUBLIC_ARCHIVE_CONTACT = original;
});

describe('the handling notice', () => {
  it('has a version that can be stamped on a record', () => {
    // Stored in items.consent_version, which is text(40) and required by the
    // submission endpoint.
    expect(CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}[a-z]?$/);
    expect(CONSENT_VERSION.length).toBeLessThanOrEqual(40);
  });

  it('covers every promise the system makes', () => {
    const headings = CONSENT_CLAUSES.map((c) => c.heading);
    // Each of these corresponds to something the code actually does. Dropping
    // one means the archive is doing it without having said so.
    expect(headings).toContain('What happens to what you send');
    expect(headings).toContain('The machine reading');
    expect(headings).toContain('Your name and email address, if you give them');
    expect(headings).toContain('Names of people');
    expect(headings).toContain('Rights in the material');
    expect(headings).toContain('Changing your mind');
  });

  it('says plainly that an email grants no access', () => {
    const emailClause = CONSENT_CLAUSES.find((c) => c.heading.startsWith('Your name and email'))!;
    const text = emailClause.body.join(' ');
    // The security property this promises is real: there is no lookup by email
    // anywhere in the codebase, and adding one would make this sentence false.
    expect(text).toMatch(/Neither is published/i);
    expect(text).toMatch(/grants no access/i);
    expect(text).toMatch(/retrieve your uploads/i);
  });

  it('says who can see a contributor address, and is right about it', () => {
    // This clause has now been reversed once. It said volunteers could not read
    // an address (2026-09-02) and it says they can (2026-09-02b). The test
    // exists because the wording is a promise about a permission, and the
    // permission is `contributors_volunteer_select` in migration 0020 — if one
    // moves without the other, one of them is lying to a contributor.
    const emailClause = CONSENT_CLAUSES.find((c) => c.heading.startsWith('Your name and email'))!;
    const text = emailClause.body.join(' ');
    expect(text).toMatch(/volunteers who catalogue the archive can see both/i);
    expect(text).toMatch(/belongs to a particular family/i);
    // And the limit on it: a family link is not itself publication.
    expect(text).toMatch(/not published by that alone/i);
  });

  it('explains that being forgotten and withdrawing material are two requests', () => {
    // Added when preflight found that neither request could be honoured through
    // the interface at all: the register had no edit path and no delete path,
    // and `contributors_admin_delete` was a policy nothing called. Both work
    // now, and erasure keeps the material — so the notice has to say which of
    // the two a contributor is asking for.
    const change = CONSENT_CLAUSES.find((c) => c.heading === 'Changing your mind')!;
    const text = change.body.join(' ');
    expect(text).toMatch(/forgotten without withdrawing/i);
    expect(text).toMatch(/material stays in the archive/i);
    expect(text).toMatch(/separate requests/i);
  });

  it('warns that family names are published', () => {
    const names = CONSENT_CLAUSES.find((c) => c.heading === 'Names of people')!;
    expect(names.body.join(' ')).toMatch(/published/i);
  });

  it('names the outside service and is truthful about the tier', () => {
    const machine = CONSENT_CLAUSES.find((c) => c.heading === 'The machine reading')!;
    const text = machine.body.join(' ');
    expect(text).toMatch(/Gemini/);

    // The first draft of this clause said Google does not train on the content.
    // That holds for paid use and not for the free tier this runs on, and a
    // false sentence in a consent notice is the worst place for one. If the
    // archive moves to a paid account, this clause changes and the version
    // string changes with it.
    expect(text).toMatch(/free tier/i);
    expect(text).toMatch(/used to improve their products/i);
    expect(text).not.toMatch(/does not use content .* to train/i);
  });

  it('has a summary short enough to sit beside a tick box', () => {
    expect(CONSENT_SUMMARY.length).toBeLessThan(160);
  });

  it('every clause has something in it', () => {
    for (const clause of CONSENT_CLAUSES) {
      expect(clause.body.length, clause.heading).toBeGreaterThan(0);
      expect(clause.body.every((p) => p.trim().length > 0), clause.heading).toBe(true);
    }
  });
});

describe('the withdrawal address', () => {
  it('is admitted as missing rather than invented', () => {
    delete process.env.NEXT_PUBLIC_ARCHIVE_CONTACT;
    expect(contactAddress()).toBeNull();

    const sentence = contactSentence();
    expect(sentence).toMatch(/has not yet published a contact address/i);
    // The failure this guards against is a plausible-looking address that
    // receives no mail, which is worse than an admitted gap.
    expect(sentence).not.toMatch(/@/);
  });

  it('is used once it is supplied', () => {
    process.env.NEXT_PUBLIC_ARCHIVE_CONTACT = 'archive@example.org';
    expect(contactAddress()).toBe('archive@example.org');
    expect(contactSentence()).toContain('archive@example.org');
  });

  it('treats blank configuration as missing', () => {
    process.env.NEXT_PUBLIC_ARCHIVE_CONTACT = '   ';
    expect(contactAddress()).toBeNull();
  });
});
