import { describe, expect, it } from 'vitest';
import { GUIDE_FILES, canOpen, depthOf, resolveGuidePath } from '@/lib/guides/catalogue';
import { walkthrough } from '@/lib/guides/steps';
import { STEP_TEXT } from '@/lib/guides/step-text';
import shots from '@/lib/guides/shots.json';

/**
 * The guides hub draws one line - who may open which guide - and two places
 * depend on it: the page, which does not render a closed section, and
 * /api/guides, which will not sign a URL for a closed file. Both read
 * `canOpen` and `resolveGuidePath`, so these are the lock.
 */

describe('who may open a guide', () => {
  it('opens the contributor guide to everyone, signed in or not', () => {
    for (const role of [null, undefined, 'pending', 'volunteer', 'admin'] as const) {
      expect(canOpen('contributor', role)).toBe(true);
    }
  });

  it('opens the knowledge-expert guide to approved accounts only', () => {
    expect(canOpen('expert', null)).toBe(false);
    // Anyone can register; a pending account has a session and no rights.
    expect(canOpen('expert', 'pending')).toBe(false);
    expect(canOpen('expert', 'volunteer')).toBe(true);
    expect(canOpen('expert', 'admin')).toBe(true);
  });

  it('opens the administrator guide to administrators only', () => {
    expect(canOpen('admin', null)).toBe(false);
    expect(canOpen('admin', 'pending')).toBe(false);
    expect(canOpen('admin', 'volunteer')).toBe(false);
    expect(canOpen('admin', 'admin')).toBe(true);
  });
});

describe('what the guides route will serve', () => {
  it('knows every listed file, with the audience it was listed under', () => {
    for (const file of GUIDE_FILES) {
      expect(resolveGuidePath(file.path)?.audience).toBe(file.audience);
    }
  });

  it('takes a step screenshot’s audience from its path', () => {
    expect(resolveGuidePath('steps/expert/he/queue.png')?.audience).toBe('expert');
    expect(resolveGuidePath('steps/contributor/en/menu.png')?.audience).toBe('contributor');
  });

  it('refuses anything else rather than turning it into a storage path', () => {
    for (const path of [
      '../heritage/uploads/x.jpg',
      'pdf/../video/expert-he.mp4',
      'steps/expert/he/../../pdf/admin-he.pdf',
      'steps/other/he/x.png',
      'steps/expert/fr/x.png',
      'pdf/secret.pdf',
      '',
    ]) {
      expect(resolveGuidePath(path)).toBeNull();
    }
  });
});

describe('the walkthrough data', () => {
  it('has words for every screenshot it measured', () => {
    for (const [audience, steps] of Object.entries(shots as Record<string, Record<string, unknown>>)) {
      const ids = new Set(STEP_TEXT[audience as keyof typeof STEP_TEXT].map((s) => s.id));
      for (const id of Object.keys(steps)) expect(ids.has(id), `${audience}/${id}`).toBe(true);
    }
  });

  it('never uses an em or en dash, which the Center’s house style forbids', () => {
    const all = JSON.stringify(STEP_TEXT);
    expect(all).not.toMatch(/[–—]/);
  });
});

describe('quick and in-depth learning', () => {
  it('opens in quick mode unless in depth is asked for', () => {
    expect(depthOf(undefined)).toBe('quick');
    expect(depthOf('deep')).toBe('deep');
    expect(depthOf('anything')).toBe('quick');
  });

  it('keeps fewer steps in quick mode, in the same order, with the short sentence', () => {
    for (const lang of ['he', 'en'] as const) {
      const deep = walkthrough('contributor', lang, 'deep');
      const quick = walkthrough('contributor', lang, 'quick');
      expect(quick.length).toBeGreaterThan(0);
      expect(quick.length).toBeLessThan(deep.length);
      const order = deep.map((s) => s.id);
      expect(quick.map((s) => order.indexOf(s.id))).toEqual([...quick.map((s) => order.indexOf(s.id))].sort((a, b) => a - b));
      for (const step of quick) expect(step.body.length).toBeLessThan(deep.find((d) => d.id === step.id)!.body.length);
    }
  });

  it('lists one PDF per language for each mode and role', () => {
    for (const depth of ['quick', 'deep'] as const) {
      for (const audience of ['contributor', 'expert', 'admin'] as const) {
        expect(GUIDE_FILES.filter((f) => f.kind === 'pdf' && f.depth === depth && f.audience === audience)).toHaveLength(2);
      }
    }
  });
});
