/**
 * The reading's unverified background, and the web pages it came from.
 *
 * ── why this is kept apart from the catalogue ───────────────────────────────
 *
 * Rafi compared the archive's reading of an item with what the Gemini app said
 * about the same file (16.09.2026), and the app's answer was richer: a likely
 * decade, which communities used such objects, what the script suggests. The
 * archive's reading is poorer on purpose — every field has to name what it
 * rests on, and a guess never reaches a Moderator — and that is not changing.
 *
 * What was missing is a place for the other kind of knowledge: what a
 * well-read person would *say about* the item without being able to point at
 * it. That now comes back as `background`, with web search allowed while it is
 * written, and it lives in the analysis's raw answer and nowhere else. It is
 * shown under its own heading, marked as unverified, and no button copies it
 * into a record. A Moderator who wants a sentence of it checks it and types it.
 *
 * Since 24.09.2026 it is a general description in the manner of a Deep
 * Research answer (Inon): five short headings — what this is, period,
 * community and place, historical context, worth finding out — with a
 * paragraph under each, instead of six loose sentences. Same field, same
 * rules, same single model call; `sectionsOf` splits it for the screen, and a
 * reading stored before the change, with no headings, is one untitled section.
 *
 * Client-safe: a pure reader of the stored answer, used by the upload screen
 * and the review workbench alike.
 */

export interface BackgroundSource {
  title: string;
  url: string;
}

export interface Background {
  text: string;
  sources: BackgroundSource[];
}

/** At most this many pages are listed. Search returns more than anyone opens. */
export const MAX_SOURCES = 6;

function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Only well-formed web links, each once, at most MAX_SOURCES. */
export function cleanSources(value: unknown): BackgroundSource[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: BackgroundSource[] = [];

  for (const row of value as { title?: unknown; url?: unknown }[]) {
    if (!row || !isWebUrl(row.url) || seen.has(row.url)) continue;
    seen.add(row.url);
    const title = typeof row.title === 'string' && row.title.trim() ? row.title.trim() : new URL(row.url).hostname;
    out.push({ title: title.slice(0, 200), url: row.url });
    if (out.length >= MAX_SOURCES) break;
  }
  return out;
}

/** The background held in an analysis's raw answer, or null when there is none. */
export function backgroundOf(raw: unknown): Background | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as { background?: unknown; backgroundSources?: unknown };
  const text = typeof record.background === 'string' ? record.background.trim() : '';
  if (!text) return null;
  return { text, sources: cleanSources(record.backgroundSources) };
}

export interface BackgroundSection {
  heading: string | null;
  paragraphs: string[];
}

/**
 * The description split at its "## " headings.
 *
 * Text before the first heading — or a whole answer written before headings
 * were asked for — is a section with no heading. Bold markers a model adds
 * despite being asked not to are dropped rather than shown as asterisks.
 */
export function sectionsOf(text: string): BackgroundSection[] {
  const sections: BackgroundSection[] = [];
  let current: BackgroundSection = { heading: null, paragraphs: [] };
  let paragraph: string[] = [];

  const closeParagraph = () => {
    if (paragraph.length) current.paragraphs.push(paragraph.join(' '));
    paragraph = [];
  };
  const closeSection = () => {
    closeParagraph();
    if (current.heading || current.paragraphs.length) sections.push(current);
  };

  for (const raw of text.replace(/\*\*/g, '').split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^#{1,4}\s+(.+)$/.exec(line);
    if (heading) {
      closeSection();
      current = { heading: heading[1].trim(), paragraphs: [] };
    } else if (!line) {
      closeParagraph();
    } else {
      paragraph.push(line.replace(/^[-*•]\s+/, ''));
    }
  }
  closeSection();
  return sections;
}
