/**
 * Which of the archive's languages an item's own text is written in.
 *
 * The switch under a transcription leaves out the language the text is already
 * in, because that is what the "Original" chip shows. It used to leave out the
 * language the contributor asked the AI to write its reading in instead — a
 * different thing entirely. A Hebrew speaker describing an English banknote
 * picked Hebrew for the reading, and the switch then dropped the Hebrew button:
 * the one translation of the banknote they could read. Found while capturing
 * the contributor guide, 16.09.2026.
 *
 * The model reports the material's language as a name ("English") and
 * sometimes as a code ("en"); both are matched. Anything else — a language the
 * archive does not publish in, or no answer at all — returns null, and then
 * nothing is left out, because offering one chip too many costs a click and
 * hiding the reader's own language costs them the text.
 */
export function materialLanguage(
  reported: string | null | undefined,
  languages: ReadonlyArray<{ code: string; label_en: string }>,
): string | null {
  const wanted = reported?.trim().toLowerCase();
  if (!wanted) return null;
  return (
    languages.find((l) => l.code.toLowerCase() === wanted || l.label_en.toLowerCase() === wanted)?.code ?? null
  );
}
