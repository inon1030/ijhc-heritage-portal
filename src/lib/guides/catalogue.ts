import type { Profile } from '@/lib/types';

/**
 * The guides hub: who may open which guide, and where each file lives.
 *
 * Three audiences, decided by Inon on 21.09.2026: the contributor guide is open
 * to everyone, the knowledge-expert guide needs an approved account, and the
 * administrator guide needs an administrator. The line is drawn here once and
 * enforced twice - the page does not render a section the reader may not see,
 * and `/api/guides/...` will not sign a URL for a file they may not open. The
 * bucket itself is private, so a guessed storage path gets nothing.
 *
 * The files are not in the repository. PDFs and videos are tens of megabytes
 * each and belong to the Center, not to the code; they are uploaded to the
 * `guides` bucket by `scripts/guides/upload.mjs` from `DOCS/`.
 */

export type Audience = 'contributor' | 'expert' | 'admin';
export type GuideLanguage = 'he' | 'en';

export const AUDIENCES: Audience[] = ['contributor', 'expert', 'admin'];

export function canOpen(audience: Audience, role: Profile['role'] | null | undefined): boolean {
  if (audience === 'contributor') return true;
  if (audience === 'expert') return role === 'volunteer' || role === 'admin';
  return role === 'admin';
}

export interface GuideFile {
  /** Path inside the private `guides` bucket, and the tail of `/api/guides/`. */
  path: string;
  audience: Audience;
  kind: 'pdf' | 'video';
  language: GuideLanguage;
  /** Shown beside the link so nobody starts a 25 MB download by surprise. */
  megabytes: number;
  /** Videos only, as the Center's own files name it. */
  duration?: string;
}

export const GUIDE_FILES: GuideFile[] = [
  { path: 'pdf/contributor-he.pdf', audience: 'contributor', kind: 'pdf', language: 'he', megabytes: 2.5 },
  { path: 'pdf/contributor-en.pdf', audience: 'contributor', kind: 'pdf', language: 'en', megabytes: 2.9 },
  { path: 'pdf/expert-he.pdf', audience: 'expert', kind: 'pdf', language: 'he', megabytes: 2.4 },
  { path: 'pdf/expert-en.pdf', audience: 'expert', kind: 'pdf', language: 'en', megabytes: 2.7 },
  { path: 'pdf/admin-he.pdf', audience: 'admin', kind: 'pdf', language: 'he', megabytes: 0.9 },
  { path: 'pdf/admin-en.pdf', audience: 'admin', kind: 'pdf', language: 'en', megabytes: 1.0 },
  { path: 'video/contributor-he.mp4', audience: 'contributor', kind: 'video', language: 'he', megabytes: 9.4, duration: '7:06' },
  { path: 'video/contributor-en.mp4', audience: 'contributor', kind: 'video', language: 'en', megabytes: 7.1, duration: '4:39' },
  { path: 'video/expert-he.mp4', audience: 'expert', kind: 'video', language: 'he', megabytes: 12.7, duration: '9:50' },
  { path: 'video/expert-en.mp4', audience: 'expert', kind: 'video', language: 'en', megabytes: 9.9, duration: '7:07' },
  // Shown in its own frame on the page (portrait), not in the video grid.
  { path: 'video/scanning-he.mp4', audience: 'contributor', kind: 'video', language: 'he', megabytes: 5.2, duration: '1:06' },
];

/**
 * The scanning video: a phone recording by Avigdor Sharon of scanning a page
 * with Google Drive's scanner, 16.09.2026.
 *
 * Hosted here rather than embedded from his Drive, so it keeps working whatever
 * happens to the share (Inon, 21.09.2026). The 125 MB original was re-encoded
 * to 720p (5.4 MB) by `DOCS/_build` with his account address blurred on the
 * final screens and a small credit burned into the corner; the page credits him
 * under the player as well.
 */
export const SCANNING_VIDEO = {
  path: 'video/scanning-he.mp4',
  credit: 'Avigdor Sharon',
  duration: '1:06',
};

/** Walkthrough screenshots: `steps/<audience>/<language>/<name>.png`. */
const STEP_IMAGE = /^steps\/(contributor|expert|admin)\/(he|en)\/[a-z0-9-]{1,40}\.png$/;

/**
 * What a path under `/api/guides/` is, or null if it is not one the hub
 * serves. Anything not in the list above and not a step image is refused -
 * the route never turns an arbitrary string into a storage path.
 */
export function resolveGuidePath(path: string): { audience: Audience; mime: string } | null {
  const file = GUIDE_FILES.find((f) => f.path === path);
  if (file) return { audience: file.audience, mime: file.kind === 'pdf' ? 'application/pdf' : 'video/mp4' };
  const step = STEP_IMAGE.exec(path);
  if (step) return { audience: step[1] as Audience, mime: 'image/png' };
  return null;
}

/** The two languages the guides are written in; everything else reads English. */
export function guideLanguage(code: string): GuideLanguage {
  return code === 'he' ? 'he' : 'en';
}
