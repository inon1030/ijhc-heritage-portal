import { describe, expect, it } from 'vitest';
import { captureKind, fileNameFor, mightBeArchived, videoProvider } from '@/lib/links/policy';
import { shouldAlert } from '@/lib/problems/alert';

describe('what an address turned out to be', () => {
  it('reads a page as a page', () => {
    expect(captureKind('text/html; charset=UTF-8')).toBe('page');
    expect(captureKind('application/xhtml+xml')).toBe('page');
  });

  it('keeps the material itself when the address is a file', () => {
    for (const type of ['application/pdf', 'image/jpeg', 'audio/mpeg', 'video/mp4', 'text/plain']) {
      expect(captureKind(type)).toBe('file');
    }
  });

  it('refuses what the archive cannot hold', () => {
    for (const type of ['application/zip', 'application/msword', 'application/json', '']) {
      expect(captureKind(type)).toBe('no');
    }
  });
});

describe('video hosts', () => {
  it('are matched on the whole host, never a substring', () => {
    expect(videoProvider(new URL('https://youtu.be/abc'))).toBe('youtube');
    expect(videoProvider(new URL('https://www.youtube.com/watch?v=abc'))).toBe('youtube');
    expect(videoProvider(new URL('https://vimeo.com/123'))).toBe('vimeo');
    expect(videoProvider(new URL('https://youtube.com.evil.test/watch?v=abc'))).toBeNull();
    expect(videoProvider(new URL('https://jewishmuseum.org.uk/a'))).toBeNull();
  });
});

describe('when a public copy is worth asking for', () => {
  it('is asked for on a refusal, not on a private or missing page', () => {
    expect(mightBeArchived(403)).toBe(true); // the bot challenge that started this
    expect(mightBeArchived(429)).toBe(true);
    expect(mightBeArchived(451)).toBe(true);
    expect(mightBeArchived(503)).toBe(true);
    expect(mightBeArchived(401)).toBe(false);
    expect(mightBeArchived(404)).toBe(false);
  });
});

describe('the name a fetched file is stored under', () => {
  it('keeps the one in the address when it has an extension', () => {
    expect(fileNameFor(new URL('https://x.org/docs/register.pdf'), 'application/pdf')).toBe('register.pdf');
  });

  it('builds one from the type when the address has none', () => {
    // The last part of the path names it when there is one, and the host when
    // there is not.
    expect(fileNameFor(new URL('https://www.x.org/download?id=7'), 'image/jpeg')).toBe('download.jpg');
    expect(fileNameFor(new URL('https://x.org/a/b/'), 'audio/mpeg')).toBe('b.mp3');
    expect(fileNameFor(new URL('https://www.x.org/'), 'application/pdf')).toBe('x.org.pdf');
  });
});

describe('who is mailed about a fault', () => {
  it('sends the first of a burst and nothing after it', () => {
    expect(shouldAlert(1, 1)).toBe(true);
    expect(shouldAlert(2, 2)).toBe(false);
    expect(shouldAlert(9, 9)).toBe(false);
  });

  it('goes quiet in a storm, where the log is the right place to look', () => {
    expect(shouldAlert(1, 31)).toBe(false);
    expect(shouldAlert(1, 30)).toBe(true);
  });
});
