import { afterEach, describe, expect, it, vi } from 'vitest';
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
    expect(headings).toContain('What the Center may do without asking you');
  });

  /**
   * This clause has now been reversed twice, and both times by this test.
   *
   * It used to end "nobody can retrieve your uploads by typing it", and the
   * comment beside it said: *there is no lookup by email anywhere in the
   * codebase, and adding one would make this sentence false.* On 06.09.2026 a
   * lookup by email was added to the portal, and this test failed before the
   * feature shipped — which is the entire reason it was written that way.
   *
   * So the promise changed rather than quietly becoming untrue, and the
   * version changed with it (`2026-09-06`). What it now has to say is the pair
   * of facts that actually hold: a public record CAN be found from the address,
   * and anything not yet published CANNOT.
   */
  it('is honest about what an address can now be used to find', () => {
    const emailClause = CONSENT_CLAUSES.find((c) => c.heading.startsWith('Your name and email'))!;
    const text = emailClause.body.join(' ');

    expect(text).toMatch(/Neither is published as part of a record/i);
    expect(text).toMatch(/grants no access/i);

    // The half that is newly permitted, said out loud rather than left for
    // somebody to discover.
    expect(text).toMatch(/anyone who knows it/i);
    expect(text).toMatch(/already public/i);

    // And the half that is not. `listItemsByContributor` filters to
    // status=accepted, access=public for anyone who is not a volunteer; if that
    // filter is ever dropped, this sentence becomes the lie the old one was.
    expect(text).toMatch(/review|not accepted/i);
    expect(text).toMatch(/never shown/i);

    // The retired promise must not survive anywhere in the clause.
    expect(text).not.toMatch(/nobody can retrieve/i);
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

  it('says the Center may remove material without notice, and does not thereby take away the two requests', () => {
    // Added 2026-09-03 at Inon's instruction: volunteers must be able to
    // curate — decline, unpublish, remove — without a duty to write to the
    // contributor first, which with limited volunteer time would mean the
    // decisions do not get made.
    //
    // The contributor's own right to ask is deliberately NOT removed with it.
    // Deleting the sentence would not delete the obligation, and this file's
    // first rule is that it describes what the system actually does — the
    // register can now answer both requests, so it says so.
    const discretion = CONSENT_CLAUSES.find(
      (c) => c.heading === 'What the Center may do without asking you',
    )!;
    const text = discretion.body.join(' ');
    expect(text).toMatch(/without telling you first/i);
    expect(text).toMatch(/does not undertake to notify you/i);
    expect(text).toMatch(/does not affect the two requests/i);

    const change = CONSENT_CLAUSES.find((c) => c.heading === 'Changing your mind')!;
    expect(change.body.join(' ')).toMatch(/at any time/i);
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

/**
 * The tier, the sentence, and the version, moving together.
 *
 * On the unpaid tier Google's terms let them read what is sent; on a paid
 * account they undertake the opposite. That difference is the largest thing
 * this notice contains and it is what a family decides on — so the sentence
 * has to follow the account, and the version has to follow the sentence.
 *
 * Read from a fresh import per case, because the module reads the environment
 * once at load. That is the point: the tier is a deploy-time fact, not
 * something a request can change.
 */
describe('the model tier the notice describes', () => {
  const load = async (paid: boolean) => {
    vi.resetModules();
    const previous = process.env.GEMINI_PAID_TIER;
    process.env.GEMINI_PAID_TIER = paid ? 'true' : 'false';
    const mod = await import('@/lib/consent');
    const clause = mod.CONSENT_CLAUSES.find((c) => c.heading === 'The machine reading')!;
    process.env.GEMINI_PAID_TIER = previous;
    return { version: mod.CONSENT_VERSION, text: clause.body.join(' ') };
  };

  it('warns families off private material while the archive is not paying', async () => {
    const { version, text } = await load(false);
    expect(text).toMatch(/free tier/i);
    expect(text).toMatch(/may be reviewed by people at Google/i);
    expect(text).toMatch(/do not upload it here/i);
    expect(version).toBe('2026-09-06');
  });

  it('stops warning them off it once the archive is paying, and says why', async () => {
    const { version, text } = await load(true);
    expect(text).toMatch(/paid account/i);
    expect(text).toMatch(/not reviewed by people at Google/i);
    // The remaining caveat is real and must survive: it still leaves the
    // building, even if nobody there reads it.
    expect(text).toMatch(/still leaves the Center/i);
    // And it must NOT keep telling people not to send private material.
    expect(text).not.toMatch(/do not upload it here/i);
    expect(version).toBe('2026-09-06-paid');
  });

  it('never lets the two tiers share a version string', async () => {
    const free = await load(false);
    const paid = await load(true);
    expect(free.version).not.toBe(paid.version);
    expect(free.text).not.toBe(paid.text);
  });
});
