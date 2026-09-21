/**
 * Which files become which records.
 *
 * Until 21.09.2026 there were two answers for the whole submission: every file
 * is a page of one item, or every file is its own item. Scanning with the phone
 * adds a third, because a person scanning a drawer of papers is naturally doing
 * several documents of several pages each - and says so as they go, with
 * "another page of this document" or "a separate document".
 *
 * So a picked file may carry a `doc`: the scanned document it is a page of.
 * Every scanned document is one record, its pages in the order they were taken.
 * Files added the ordinary way (chosen, dropped, pasted) carry none and follow
 * the old question, which is only asked when there are two or more of them.
 *
 * Returned as lists of file ids, in the order the person added things, because
 * the upload flow already keys drafts and analyses by file id.
 */

export type Grouping = 'one' | 'separate';

export interface Groupable {
  id: string;
  /** The scanned document this file is a page of. Absent for an ordinary file. */
  doc?: string;
}

export function groupFiles(files: Groupable[], grouping: Grouping): string[][] {
  const docs = new Map<string, string[]>();
  const loose: string[] = [];
  const order: (string | { loose: true })[] = [];

  for (const file of files) {
    if (file.doc) {
      if (!docs.has(file.doc)) {
        docs.set(file.doc, []);
        order.push(file.doc);
      }
      docs.get(file.doc)!.push(file.id);
    } else {
      if (!loose.length) order.push({ loose: true });
      loose.push(file.id);
    }
  }

  const groups: string[][] = [];
  for (const entry of order) {
    if (typeof entry === 'string') groups.push(docs.get(entry)!);
    else if (grouping === 'one') groups.push(loose);
    else groups.push(...loose.map((id) => [id]));
  }
  return groups;
}

/** Ordinary files only: the ones the "one item or several?" question is about. */
export function looseCount(files: Groupable[]): number {
  return files.filter((f) => !f.doc).length;
}
