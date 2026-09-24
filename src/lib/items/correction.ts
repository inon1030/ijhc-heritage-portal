/**
 * What the contributor changed in the machine's reading, and nothing else.
 *
 * A block left as the machine wrote it is not a correction and comes back as
 * null, so the review screen can tell "a person fixed this" from "nobody
 * touched it". No reading at all means nothing to correct. See migration 0030.
 */
export function correctionOf(
  machine: { ocrText: string | null; transcript: string | null } | null,
  typed: Partial<Record<'ocrText' | 'transcript', string>> | undefined,
): { ocrText: string | null; transcript: string | null } | null {
  if (!machine || !typed) return null;
  const changed = (key: 'ocrText' | 'transcript') => {
    const value = typed[key];
    if (value === undefined || machine[key] === null) return null;
    const trimmed = value.trim();
    return trimmed && trimmed !== machine[key]!.trim() ? trimmed : null;
  };
  const ocrText = changed('ocrText');
  const transcript = changed('transcript');
  return ocrText || transcript ? { ocrText, transcript } : null;
}
