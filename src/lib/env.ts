import CHAIN from '@/lib/ai/models.json';
/**
 * Environment access, in one place, validated once.
 *
 * Client-visible values are read directly from `process.env` so Next can inline
 * them at build time. Server-only secrets are read lazily and throw a useful
 * message rather than producing an undefined that fails somewhere far away.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export function serviceRoleKey(): string {
  return required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** 'gemini' when a key is present, otherwise the clearly-labelled simulator. */
export function aiProviderId(): 'gemini' | 'mock' {
  const explicit = process.env.AI_PROVIDER;
  if (explicit === 'gemini' || explicit === 'mock') return explicit;
  return process.env.GEMINI_API_KEY ? 'gemini' : 'mock';
}

export function geminiApiKey(): string {
  return required('GEMINI_API_KEY', process.env.GEMINI_API_KEY);
}

// Verified against the live API on 2026-08-19. gemini-2.5-flash is listed by
// the models endpoint but refuses new API keys, so it is not a safe default.
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? CHAIN.primary;

/**
 * What cataloguing falls back to when the day's allowance on the first model
 * is gone.
 *
 * The free tier's quota is **per model** — `quotaValue: 20`, per project, per
 * model, per day. Since decision 19 put translation back on the cataloguing
 * model, the two share those twenty, and on 06.09.2026 they ran out in the
 * afternoon: a contributor uploading a photograph was told "the analysis
 * service did not respond" while the service was answering perfectly well and
 * saying *no*.
 *
 * Falling back is safe **here** in a way it explicitly was not for translation.
 * The lite model's failure mode is that it cannot hold a script it does not
 * really know — it produced Malayalam that decayed into Cyrillic mid-word.
 * Cataloguing does not ask it to write Malayalam: it reads a document and
 * describes it in English, and every field it proposes is gated at 70%
 * confidence and then read by a volunteer before it can reach a record.
 *
 * A record catalogued a little less well, that a person then corrects, is worth
 * more than no reading at all — which is what the alternative is once the first
 * model is out.
 */
export const GEMINI_FALLBACK_MODELS = (
  /*
   * Ordered by how well they read a document, not by how cheap they are.
   *
   * The allowance is per model, so each name here is another twenty readings a
   * day — measured before a conference where end users would be uploading:
   * 3.6-flash was spent, 3.8-flash and both lite models were answering, and
   * 3.7-flash was returning 503 (busy, not exhausted, which is why it is not
   * in the list — a model that makes people wait is worse than the next one
   * down).
   *
   * Every name here must be a **distinct** model, and that is not obvious from
   * the name. `gemini-flash-lite-latest` was in this list until its
   * `modelVersion` was read back: it resolves to `gemini-3.5-flash-lite`, the
   * same model, sharing the same allowance. It added a wasted round trip when
   * that model ran out and — worse — made `npm run quota` report capacity that
   * did not exist.
   *
   * `gemini-3.8-flash` goes first: a full flash model, and fast. Then
   * `gemini-3.5-flash` and `gemini-3.7-flash`, both full models — 3.7 measured
   * at 2.4s against sub-second for the others, which is worth having when the
   * alternative is nothing and worth avoiding when it is not. Then
   * `gemini-3-flash-preview`. The two lite models are last: they catalogue in
   * English perfectly well, which is all this path asks of them — the
   * script-losing that keeps them out of the translator does not apply here.
   *
   * **Seven distinct models, so roughly a hundred and forty readings a day.**
   * It was four and eighty. Every name was verified by asking it a real
   * question and reading `modelVersion` off the reply, which is also how two
   * candidates were rejected: `gemini-2.5-flash` and `gemini-2.5-flash-lite`
   * are still returned by `models.list` and answer `generateContent` with
   * **404, no longer available**. The catalogue of models is not the list of
   * models that work.
   *
   * That withdrawal is also why `withFallback` now treats a 404 the way it
   * treats a 429. A name here is a name Google can retire between two deploys,
   * and until today that would have taken the whole archive down with it.
   */
  process.env.GEMINI_FALLBACK_MODELS ?? CHAIN.fallbacks.join(',')
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

/**
 * The model that translates. Configurable, and it has been wrong once.
 *
 * It was `gemini-3.5-flash-lite`, split off from cataloguing because the free
 * tier's quota is **per project per model** — measured at twenty requests a day,
 * with `gemini-3.6-flash` returning 429 while the lite model answered in the
 * same second. The reasoning was that a lighter task deserves a lighter model:
 * reading a scanned Judeo-Arabic ketubah needs the better one, turning a
 * finished English description into Hebrew does not.
 *
 * **That last part is false, and Malayalam is where it shows.** The same
 * prompt, put to both models with the same schema and temperature 0:
 *
 * - `gemini-3.6-flash` — 5.9s, `finishReason: STOP`, clean Malayalam.
 * - `gemini-3.5-flash-lite` — once `finishReason: RECITATION` after **142
 *   seconds** with no text at all; once text that decayed mid-word into
 *   Cyrillic and then an English apology: `തിരശ്ശീലাйбх - sorry, correcting
 *   Malayalam`.
 * - `gemini-flash-lite-latest` — Malayalam sliding into Gurmukhi and Devanagari
 *   inside a single word.
 *
 * Malayalam writes a consonant and its vowel as one cluster, so a model that is
 * merely approximating the script produces something that looks like writing
 * and is not. Nobody on this side of the archive reads it well enough to
 * notice — which is exactly why it cannot be left to the cheaper model. A
 * Cochin family opening their grandmother's photograph in Malayalam is the
 * whole point of publishing in Malayalam.
 *
 * So cataloguing and translation share a model again. If that turns out to
 * cost the archive its cataloguing allowance, the answer is the paid tier or a
 * different translator — not quietly worse Malayalam. Set
 * `GEMINI_TRANSLATE_MODEL` to move it without a deploy.
 */
export const GEMINI_TRANSLATE_MODEL =
  process.env.GEMINI_TRANSLATE_MODEL ?? CHAIN.translate.chain[0];

/**
 * The translator's own chain, lite first — and not the analyser's order.
 *
 * Measured on 08.09.2026, the same five-language batch through each model:
 *
 *     gemini-3.5-flash-lite     1.8s     0 thinking tokens
 *     gemini-3.1-flash-lite     3.9s     0 thinking tokens
 *     gemini-3.5-flash         19.0s   3,134 thinking tokens
 *     gemini-3.5-flash (no thinking)   7.3s
 *
 * Two findings, and both were costing the contribution screen its whole point.
 *
 * **A full flash model thinks before it translates.** Three thousand tokens of
 * reasoning to render a synagogue plaque, which is eleven seconds spent on a
 * task with nothing to reason about. The lite models do not think at all, and
 * their output was as good — a translation is constrained by a schema and
 * checked for script on the way back.
 *
 * **And it started on the analyser's own model.** So the two competed for one
 * allowance of twenty; when the analyser had spent it, every translation
 * walked the chain paying a refusal and a retry before landing somewhere slow.
 * That is where the fifteen to thirty seconds a contributor was waiting came
 * from — not from the translation at all.
 */
export const GEMINI_TRANSLATE_MODELS: string[] = (
  process.env.GEMINI_TRANSLATE_MODELS ?? CHAIN.translate.chain.join(',')
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

