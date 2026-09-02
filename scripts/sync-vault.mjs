/**
 * Re-publishes the living docs in `PILOT WITH EREZ/` into the Obsidian vault.
 *
 * The repo folder is the source of truth; the vault holds a copy so the project
 * is reachable from the second brain. Keeping them in step by hand lasted
 * exactly one round of edits, so this does it: renames each file to the vault's
 * naming convention, rewrites the wikilinks between them to match, and stamps
 * the frontmatter the vault standard requires — English keys, Hebrew values,
 * exactly one nested domain tag.
 *
 * Only writes when the body actually changed, so `updated:` stays honest.
 *
 *   node scripts/sync-vault.mjs           report what would change
 *   node scripts/sync-vault.mjs --apply   write it
 *
 * The vault copies are GENERATED. Do not hand-edit them — the next run wins.
 * Anything the vault needs and the repo does not belongs in VAULT_ADDENDUM.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const SRC = path.join(REPO, 'PILOT WITH EREZ');
const VAULT = 'C:/Users/inon1/OneDrive/מסמכים/Obsidian/inon';
const DST = path.join(VAULT, 'Freelance', 'IJHC', 'notes');

const APPLY = process.argv.includes('--apply');

/** source filename -> [vault title, frontmatter type, one-line description] */
const DOCS = {
  '00 — Start Here.md': ['IJHC 00 - מפת הפרויקט', 'hub', 'מפת התוכן של הפרויקט — מה יש איפה'],
  '01 — System Specification.md': ['IJHC 01 - אפיון המערכת', 'spec', 'האפיון החי. מתעדכן אחרי כל פיצ׳ר מאומת'],
  '02 — Architecture.md': ['IJHC 02 - ארכיטקטורה', 'architecture', 'איך המערכת בנויה ולמה'],
  '03 — Data Model.md': ['IJHC 03 - מודל נתונים', 'architecture', 'חמש טבלאות והכלל שמעצב אותן'],
  '04 — Permissions and Security.md': ['IJHC 04 - הרשאות ואבטחה', 'knowledge', 'מי יכול מה, ואיך זה נאכף'],
  '05 — AI Layer.md': ['IJHC 05 - שכבת AI', 'knowledge', 'המנוע, ואיך מחליפים אותו'],
  '06 — Roadmap.md': ['IJHC 06 - מפת דרכים', 'strategy', 'שלב 1 עד שלב 5'],
  '07 — Decisions.md': ['IJHC 07 - יומן החלטות', 'knowledge', 'ADR - החלטות עם נימוק'],
  '08 — Claude Workflow.md': ['IJHC 08 - שיטת עבודה בקלוד', 'knowledge', 'איך מריצים את הפיתוח, צעד אחר צעד'],
  '09 — Open Questions.md': ['IJHC 09 - שאלות פתוחות', 'knowledge', 'מה עוד דורש הכרעה'],
  '10 — Setup Walkthrough.md': ['IJHC 10 - מדריך התקנה', 'knowledge', 'מאפס למערכת חיה'],
  'PROGRESS.md': ['IJHC - יומן התקדמות', 'knowledge', 'נכתב אחרי כל פעולת פיתוח מאומתת'],
};

/**
 * Sections that belong only in the vault copy — they point at notes that exist
 * there and nowhere else. They live here rather than being hand-added to the
 * vault, because a hand edit inside a generated file is lost on the next sync.
 * That already happened once.
 */
const VAULT_ADDENDUM = {
  '00 — Start Here.md': `

## התיעוד הנלווה

מסמכים שנוצרו במהלך הבנייה ואינם חלק מסדרת 00–10:

- [[IJHC - ארכיון מורשת יהודי הודו]] — **נוט הפרויקט.** המצב המסחרי, מה בנוי, ומה פתוח
- [[IJHC - מסמך עיצוב שלב 1]] — העיצוב שאושר לפני הבנייה
- [[IJHC - פרומפט בנייה לשלב 2]] — מה שמדביקים לקלוד קוד כדי להמשיך
- [[IJHC - חוקי הפרויקט לקלוד קוד]] — ששת הכללים שאסור לשבור
- [[IJHC - ניתוח הדמו המקורי]] — 8 ממצאי אבטחה בדמו הישן, 3 קריטיים
- [[כרטיס - IJHC]] — הדחיסה לצריכת AI · [[יועץ - IJHC]] — פריטים פתוחים

> [!warning] מסמך אחד שלא להשתמש בו
> \`_source/CLAUDE_CODE_PROMPT - פרומפט מתחרה, לא בשימוש.md\` מורה על מערכת אחרת לגמרי — Vite במקום Next.js, Claude במקום ג׳מיני, והזזת הדמו. נשמר כראיה בלבד. ראה [[החלטות פתוחות]] שורה 10.
`,
};

const LINKS = Object.fromEntries(
  Object.entries(DOCS).map(([file, [title]]) => [path.basename(file, '.md'), title]),
);

const today = new Date().toISOString().slice(0, 10);

function stripFrontmatter(text) {
  if (!text.startsWith('---')) return text;
  const end = text.indexOf('\n---', 3);
  return end === -1 ? text : text.slice(end + 4).replace(/^\n+/, '');
}

function frontmatter(title, type, created) {
  return [
    '---',
    `title: ${title}`,
    `type: ${type}`,
    'area: Freelance',
    'subarea: IJHC',
    'status: active',
    'client: "ארז — IJHC (Indian Jewish Heritage Center)"',
    'project: IJHC',
    'source: claude-code',
    `created: ${created}`,
    `updated: ${today}`,
    'tags:',
    '  - פרילנס/ijhc',
    '---',
    '',
  ].join('\n');
}

function build(file) {
  const [title, type, note] = DOCS[file];
  let body = stripFrontmatter(readFileSync(path.join(SRC, file), 'utf8'));

  for (const [from, to] of Object.entries(LINKS)) {
    body = body.split(`[[${from}]]`).join(`[[${to}]]`);
  }
  body = body.split('[[PROGRESS]]').join('[[IJHC - יומן התקדמות]]');

  const banner =
    `> [!info] ${note}\n` +
    '> חלק מתיעוד הפרויקט. המקור החי נמצא ב-`Downloads/project-bolt-sb1-p3rtaanf/PILOT WITH EREZ/`.\n\n';

  return { title, type, content: banner + body + (VAULT_ADDENDUM[file] ?? '') };
}

/** The body below the frontmatter, so an `updated:` bump is not a change. */
function bodyOf(text) {
  return stripFrontmatter(text).trim();
}

function createdDate(existing) {
  return /^created:\s*(\S+)/m.exec(existing ?? '')?.[1] ?? today;
}

if (!existsSync(SRC)) {
  console.error(`No source folder at ${SRC}`);
  process.exit(1);
}
if (!existsSync(VAULT)) {
  console.error(`Vault not reachable at ${VAULT}. Is OneDrive mounted?`);
  process.exit(1);
}
mkdirSync(DST, { recursive: true });

let changed = 0;
let same = 0;

for (const file of Object.keys(DOCS)) {
  if (!existsSync(path.join(SRC, file))) {
    console.log(`  missing in repo   ${file}`);
    continue;
  }

  const { title, type, content } = build(file);
  const target = path.join(DST, `${title}.md`);
  const existing = existsSync(target) ? readFileSync(target, 'utf8') : null;

  if (existing && bodyOf(existing) === bodyOf(content)) {
    same += 1;
    continue;
  }

  const out = frontmatter(title, type, createdDate(existing)) + '\n' + content;
  if (APPLY) writeFileSync(target, out, 'utf8');

  console.log(`  ${existing ? 'updated' : 'new    '}  ${title}`);
  changed += 1;
}

console.log(`\n${changed} to write, ${same} already current.`);
if (changed && !APPLY) console.log('Nothing written. Re-run with --apply.');
