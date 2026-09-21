import { describe, expect, it } from 'vitest';
import { publicationRecipients, uniqueAddresses, uploadRecipients, type Watcher } from '@/lib/mail/recipients';
import { newSubmissionMail, publicationNoticeMail } from '@/lib/mail/templates';

const w = (email: string, role: Watcher['role'], uploads = false, publications = false): Watcher => ({
  email,
  role,
  notify_uploads: uploads,
  notify_publications: publications,
});

const WATCHERS: Watcher[] = [
  w('expert.on@x.org', 'volunteer', true),
  w('expert.off@x.org', 'volunteer', false),
  w('admin.all@x.org', 'admin', true, true),
  w('admin.pub@x.org', 'admin', false, true),
  w('admin.none@x.org', 'admin'),
  // Marked, but no longer approved: a suspended account hears nothing.
  w('suspended@x.org', 'pending', true, true),
  // Only an administrator can ask for every publication.
  w('expert.pub@x.org', 'volunteer', false, true),
];

describe('who hears about a new submission', () => {
  it('is every approved account marked for uploads, and nobody else', () => {
    expect(uploadRecipients(WATCHERS, null)).toEqual(['expert.on@x.org', 'admin.all@x.org']);
  });

  it('leaves out the contributor, who gets a receipt instead', () => {
    expect(uploadRecipients(WATCHERS, ' Expert.On@X.org ')).toEqual(['admin.all@x.org']);
  });
});

describe('who hears about a publication', () => {
  it('is the publisher first, then administrators who asked', () => {
    expect(publicationRecipients('expert.off@x.org', WATCHERS, null)).toEqual([
      'expert.off@x.org',
      'admin.all@x.org',
      'admin.pub@x.org',
    ]);
  });

  it('sends one message to a publisher who is also a watching administrator', () => {
    expect(publicationRecipients('ADMIN.ALL@x.org', WATCHERS, null)).toEqual(['ADMIN.ALL@x.org', 'admin.pub@x.org']);
  });

  it('leaves out the contributor, who gets their own notice', () => {
    expect(publicationRecipients('expert.off@x.org', WATCHERS, 'admin.pub@x.org')).toEqual([
      'expert.off@x.org',
      'admin.all@x.org',
    ]);
  });

  it('still tells the administrators when nobody is signed in as the publisher', () => {
    expect(publicationRecipients(null, WATCHERS, null)).toEqual(['admin.all@x.org', 'admin.pub@x.org']);
  });
});

describe('addresses', () => {
  it('are kept once each, ignoring case and blanks', () => {
    expect(uniqueAddresses(['a@x.org', 'A@X.ORG', '', null, ' b@x.org '])).toEqual(['a@x.org', 'b@x.org']);
  });
});

describe('moderator mail', () => {
  it('links to the review screen and escapes the title', () => {
    const mail = newSubmissionMail('m@x.org', 'Saba <b>', 'https://x.org/review/7');
    expect(mail.to).toBe('m@x.org');
    expect(mail.html).toContain('href="https://x.org/review/7"');
    expect(mail.html).toContain('Saba &lt;b&gt;');
    expect(mail.html).toContain('dir="rtl"');
  });

  it('names who published it, escaped', () => {
    const mail = publicationNoticeMail('m@x.org', 'Ketubah', 'https://x.org/portal/7', 'Avi <i>');
    expect(mail.text).toContain('Avi <i>');
    expect(mail.html).toContain('Avi &lt;i&gt;');
    expect(mail.html).toContain('href="https://x.org/portal/7"');
  });
});
