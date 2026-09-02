import { describe, expect, it } from 'vitest';
import { buildStoragePath, isValidStorageKey, storageSafeName } from '@/lib/files/paths';

/**
 * The regression these guard against: an upload named `הורדה.jpg` was rejected
 * by Supabase with `Invalid key`, because the storage key was being built from
 * the original filename in its original script.
 *
 * The rule is now: keys are ASCII, names are data. The original filename lives
 * in item_files.file_name, untouched.
 */

describe('storageSafeName', () => {
  it('keeps an ordinary Latin name intact', () => {
    expect(storageSafeName('ketubah-1892.jpg')).toBe('ketubah-1892.jpg');
  });

  it('produces an accepted key for a Hebrew filename', () => {
    const key = storageSafeName('הורדה.jpg');
    expect(isValidStorageKey(key)).toBe(true);
    expect(key).toBe('file.jpg');
  });

  it('produces an accepted key for Devanagari and Malayalam', () => {
    for (const name of ['मराठी.png', 'മലയാളം.tiff', 'كتوبة.pdf']) {
      expect(isValidStorageKey(storageSafeName(name))).toBe(true);
    }
  });

  it('keeps the extension, which is what the key is actually for', () => {
    expect(storageSafeName('כתובה.jpeg')).toBe('file.jpeg');
    expect(storageSafeName('מסמך היסטורי.pdf')).toBe('file.pdf');
  });

  it('folds accented Latin rather than discarding it', () => {
    expect(storageSafeName('café-négatif.jpg')).toBe('cafe-negatif.jpg');
  });

  it('strips path separators so a name cannot escape its folder', () => {
    expect(storageSafeName('../../etc/passwd')).not.toContain('/');
    const backslash = String.fromCharCode(92);
    expect(storageSafeName('..' + backslash + '..' + backslash + 'secrets')).not.toContain(backslash);
  });

  it('never returns an empty string', () => {
    expect(storageSafeName('///')).toBe('file');
    expect(storageSafeName('   ')).toBe('file');
    expect(storageSafeName('...')).toBe('file');
  });
});

describe('buildStoragePath', () => {
  it('partitions by year and month', () => {
    const path = buildStoragePath('photo.jpg', new Date(Date.UTC(2026, 7, 19)));
    expect(path.startsWith('uploads/2026/08/')).toBe(true);
    expect(path.endsWith('-photo.jpg')).toBe(true);
  });

  it('builds an accepted key even from a name in Hebrew', () => {
    expect(isValidStorageKey(buildStoragePath('הורדה.jpg'))).toBe(true);
  });

  it('never collides for the same name', () => {
    expect(buildStoragePath('photo.jpg')).not.toBe(buildStoragePath('photo.jpg'));
  });
});
