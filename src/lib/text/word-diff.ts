/**
 * Which words of a text a person wrote, and which came from the machine.
 *
 * Michal (24.09.2026): when a contributor edits the description the AI wrote,
 * the knowledge expert should see what was the AI's and what was theirs. The
 * two texts are already stored apart — `ai_analyses.summary` and
 * `items.contributor_description` — so this is a comparison, not a new record.
 *
 * Word-level, not character-level: a reviewer reads "added: 'my grandmother's
 * wedding, 1907'", not a confetti of changed letters. Whitespace travels with
 * the word before it so the text reassembles exactly as the contributor typed.
 */

export type Origin = 'ai' | 'person';

export interface Piece {
  text: string;
  origin: Origin;
}

export type Provenance =
  | { kind: 'none' }
  | { kind: 'own' }
  | { kind: 'unchanged' }
  | { kind: 'edited'; pieces: Piece[]; added: number; removed: number };

/** Splits into words, each carrying the whitespace that follows it. */
function tokens(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

const core = (token: string) => token.trimEnd();

/**
 * Marks each word of `person` as the machine's (it appears, in order, in
 * `machine`) or the person's own. Longest common subsequence on words.
 */
export function wordOrigins(machine: string, person: string): { pieces: Piece[]; removed: number } {
  const a = tokens(machine).map(core);
  const bTokens = tokens(person);
  const b = bTokens.map(core);

  // Past this size the table costs more than it is worth; treat it as rewritten.
  if (a.length * b.length > 4_000_000) {
    return { pieces: [{ text: person, origin: 'person' }], removed: a.length };
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const lcs = new Uint16Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * cols + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * cols + j + 1] + 1
          : Math.max(lcs[(i + 1) * cols + j], lcs[i * cols + j + 1]);
    }
  }

  const pieces: Piece[] = [];
  const push = (text: string, origin: Origin) => {
    const last = pieces[pieces.length - 1];
    if (last && last.origin === origin) last.text += text;
    else pieces.push({ text, origin });
  };

  let i = 0;
  let j = 0;
  let removed = 0;
  while (j < b.length) {
    if (i < a.length && a[i] === b[j]) {
      push(bTokens[j], 'ai');
      i++;
      j++;
    } else if (i < a.length && lcs[(i + 1) * cols + j] >= lcs[i * cols + j + 1]) {
      removed++;
      i++;
    } else {
      push(bTokens[j], 'person');
      j++;
    }
  }
  removed += a.length - i;

  return { pieces, removed };
}

/** The whole answer for one description: whose it is, and if mixed, where. */
export function provenance(machine: string | null | undefined, person: string | null | undefined): Provenance {
  const p = (person ?? '').trim();
  const m = (machine ?? '').trim();
  if (!p) return { kind: 'none' };
  if (!m) return { kind: 'own' };
  if (p === m) return { kind: 'unchanged' };

  const { pieces, removed } = wordOrigins(m, p);
  if (!pieces.some((piece) => piece.origin === 'ai')) return { kind: 'own' };
  const added = pieces
    .filter((piece) => piece.origin === 'person')
    .reduce((n, piece) => n + tokens(piece.text).length, 0);
  return { kind: 'edited', pieces, added, removed };
}
