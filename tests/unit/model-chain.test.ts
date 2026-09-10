import { describe, expect, it } from 'vitest';
import {
  GEMINI_FALLBACK_MODELS,
  GEMINI_MODEL,
  GEMINI_TRANSLATE_MODEL,
  GEMINI_TRANSLATE_MODELS,
} from '@/lib/env';

/**
 * The chain is the archive's capacity, so it is worth guarding.
 *
 * On the free tier the daily allowance is counted **per model**, so every
 * distinct name in this chain is another twenty readings a day and every
 * duplicate is a wasted round trip that also makes `npm run quota` report
 * capacity the archive does not have.
 *
 * That has happened once. `gemini-flash-lite-latest` sat in the chain until its
 * `modelVersion` was read back off a real reply: it resolves to
 * `gemini-3.5-flash-lite`, the same model, sharing the same twenty calls. The
 * name told you nothing.
 *
 * A unit test cannot ask Google what a name resolves to — that needs a real
 * call, and it is `scripts/quota.mjs` that does it. What it can do is catch the
 * cheap half of the mistake: the same name twice, the primary repeated among
 * the fallbacks, an empty entry from a stray comma in an env var.
 */

describe('the model fallback chain', () => {
  const chain = [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS];

  it('names no model twice', () => {
    const seen = chain.filter((model, i) => chain.indexOf(model) !== i);
    expect(seen).toEqual([]);
  });

  it('does not list the preferred model again among the fallbacks', () => {
    expect(GEMINI_FALLBACK_MODELS).not.toContain(GEMINI_MODEL);
  });

  it('holds no empty entry', () => {
    // `GEMINI_FALLBACK_MODELS=a,,b` in an env var, or a trailing comma.
    for (const model of chain) expect(model.trim()).not.toBe('');
  });

  it('is deep enough to survive a day of a conference', () => {
    // Twenty readings a day per model. Four models — where this started — is
    // eighty, and an afternoon of end users uploading spends that.
    expect(chain.length).toBeGreaterThanOrEqual(5);
  });

  it('has a translator that is one of the models the archive knows', () => {
    expect(chain).toContain(GEMINI_TRANSLATE_MODEL);
  });
});

/**
 * The translator's chain is its own, and starts somewhere fast.
 *
 * Measured on 08.09.2026, the same five-language batch: 1.8s on
 * `gemini-3.5-flash-lite`, 19.0s on `gemini-3.5-flash` — of which eleven
 * seconds were 3,134 thinking tokens spent on a synagogue plaque. It also used
 * to *start* on the analyser's own model, so the two shared one allowance of
 * twenty and every translation after that walked the chain paying refusals.
 */
describe('the translator', () => {
  const chain = [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS];

  it('starts on the model measured fastest and most complete', () => {
    // 2.5s, and the only one that rendered the headline itself rather than
    // leaving KENESETH ELIYAHOO SYNAGOGUE standing in Latin. Pinned because
    // the obvious reorder — put the quickest first — picks the wrong model:
    // gemini-3.5-flash-lite was 1.8s and left the English headline.
    expect(GEMINI_TRANSLATE_MODELS[0]).toBe('gemini-3.1-flash-lite');
  });

  it('does not start on the model the analyser prefers', () => {
    // One allowance shared between the two is the analyser spending it and the
    // translator paying the refusal.
    expect(GEMINI_TRANSLATE_MODELS[0]).not.toBe(GEMINI_MODEL);
  });

  it('names no model twice', () => {
    const seen = GEMINI_TRANSLATE_MODELS.filter(
      (m, i) => GEMINI_TRANSLATE_MODELS.indexOf(m) !== i,
    );
    expect(seen).toEqual([]);
  });

  it('can still reach every model the archive has', () => {
    // A quiet day for the analyser is capacity the translator should be able to
    // use, and the reverse. The order differs; the set does not.
    expect([...GEMINI_TRANSLATE_MODELS].sort()).toEqual([...chain].sort());
  });
});
