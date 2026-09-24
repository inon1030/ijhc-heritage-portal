import { afterEach, describe, expect, it, vi } from 'vitest';
import { backgroundOf, cleanSources, MAX_SOURCES } from '@/lib/ai/background';
import { buildInstructions } from '@/lib/ai/prompt';
import { mailConfigured, sendMail } from '@/lib/mail';
import { publishedMail, receiptMail } from '@/lib/mail/templates';

describe('contributor mail', () => {
  it('carries the receipt link in both languages and escapes the title', () => {
    const mail = receiptMail('a@b.org', 'Saba <script>alert(1)</script>', 'https://x.org/receipt/1?t=abc');
    expect(mail.to).toBe('a@b.org');
    expect(mail.text).toContain('https://x.org/receipt/1?t=abc');
    expect(mail.html).toContain('dir="rtl"');
    expect(mail.html).toContain('dir="ltr"');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('carries the public link when a record is published', () => {
    const mail = publishedMail('a@b.org', 'Ketubah', 'https://x.org/portal/42');
    expect(mail.text).toContain('https://x.org/portal/42');
    expect(mail.html).toContain('href="https://x.org/portal/42"');
  });
});

describe('sendMail', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends nothing and does not fail while the account is not configured', async () => {
    vi.stubEnv('GMAIL_USER', '');
    vi.stubEnv('GMAIL_APP_PASSWORD', '');
    expect(mailConfigured()).toBe(false);
    await expect(sendMail(receiptMail('a@b.org', 't', 'https://x.org'))).resolves.toBe(false);
  });
});

describe('background', () => {
  it('is read from the stored answer only when there is text', () => {
    expect(backgroundOf(null)).toBeNull();
    expect(backgroundOf({ background: '   ' })).toBeNull();
    expect(backgroundOf({ background: 'Likely 1930s Bombay.' })).toEqual({
      text: 'Likely 1930s Bombay.',
      sources: [],
    });
  });

  it('keeps only web links, each once, and no more than the limit', () => {
    const sources = cleanSources([
      { title: 'ok', url: 'https://a.org/1' },
      { title: 'dup', url: 'https://a.org/1' },
      { title: 'script', url: 'javascript:alert(1)' },
      { title: '', url: 'http://b.org/x' },
      ...Array.from({ length: 10 }, (_, i) => ({ title: `n${i}`, url: `https://c.org/${i}` })),
    ]);
    expect(sources[0]).toEqual({ title: 'ok', url: 'https://a.org/1' });
    expect(sources[1]).toEqual({ title: 'b.org', url: 'http://b.org/x' });
    expect(sources.some((s) => s.url.startsWith('javascript'))).toBe(false);
    expect(sources).toHaveLength(MAX_SOURCES);
  });

  it('is told search never counts as reading, and follows the reader’s language', () => {
    const prompt = buildInstructions([], 'Hebrew');
    expect(prompt).toContain('── General description ──');
    // Inon, 24.09: the description reads like a Deep Research answer, under headings.
    expect(prompt).toContain('## What this is');
    expect(prompt).toContain('## Worth finding out');
    expect(prompt).toMatch(/nothing you found by searching counts as having read anything/);
    expect(prompt).toContain('`summary`, `background`, the `note`');
  });
});

describe('the general description, split at its headings', () => {
  it('turns "## " lines into sections and keeps paragraphs apart', async () => {
    const { sectionsOf } = await import('@/lib/ai/background');
    const sections = sectionsOf('## What this is\nA ketubah.\n\nIt is **illuminated**.\n## Period\nLikely 1890s.');
    expect(sections).toEqual([
      { heading: 'What this is', paragraphs: ['A ketubah.', 'It is illuminated.'] },
      { heading: 'Period', paragraphs: ['Likely 1890s.'] },
    ]);
  });

  it('shows a description stored before headings as one untitled section', async () => {
    const { sectionsOf } = await import('@/lib/ai/background');
    expect(sectionsOf('Probably 1930s.\nLikely Bene Israel.')).toEqual([
      { heading: null, paragraphs: ['Probably 1930s. Likely Bene Israel.'] },
    ]);
  });
});
