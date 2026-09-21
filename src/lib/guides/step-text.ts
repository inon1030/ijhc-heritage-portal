import type { Audience, GuideLanguage } from '@/lib/guides/catalogue';
import text from '@/lib/guides/step-text.json';

/**
 * The words of each walkthrough step, in the two languages the Center writes
 * its guides in.
 *
 * Kept as JSON so the site and the PDF builder (`DOCS/_build/build_role_guides.py`)
 * read the same sentences: the walkthrough on /guides and the printed guide can
 * never say two different things about the same button.
 *
 * Adapted from the Center's own guides in Drive (the contributor guide Rafi
 * corrected, and the moderators' guide), shortened to what fits beside one
 * screenshot, and using the site's own names for things: "knowledge expert",
 * "Read it with AI", "Submit for review". Each `id` matches a step in
 * `scripts/guides/steps.mjs`, which captures the screen and measures the ring.
 */

export interface StepText {
  id: string;
  title: Record<GuideLanguage, string>;
  body: Record<GuideLanguage, string>;
  /** One sentence for the quick walkthrough. Steps without it are left out of it. */
  quick?: Record<GuideLanguage, string>;
}

export const STEP_TEXT = text as Record<Audience, StepText[]>;
