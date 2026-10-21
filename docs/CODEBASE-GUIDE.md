# IJHC Heritage Portal — a guide to the code for AI coding tools

Tag selection update (21.10.2026): review, bulk review and upload share
`src/components/tag-picker.tsx`. Experts create terms through the guarded
`/api/manage/keywords` route; review saves also resolve/create explicitly chosen
terms through `ensureKeywords` in vocabulary mutations. Contributors only propose.
The full paginated vocabulary includes translations and variants across communities.
There is no tag-count cap; selected terms are trimmed and limited to 80 characters.
Migration `0038_open_tag_lengths.sql` is required for the new length range and was
written but **not applied** in this task. Decisions and verification are in
`docs/tags-open-2110.md`.

Read this file first, then `AGENTS.md`. AGENTS.md holds the rules that are not negotiable; this file holds the map. Where they disagree, AGENTS.md wins.

Last written: 20.10.2026, after phases 1–3 of Inon's request list (search, filters, review FIFO, password reset, duplicates, AI retry queue, roles, drafts, bulk review, public comments and corrections, collector credit).

---

## 1. What this system is

A digital archive for the **Indian Jewish Heritage Center** (IJHC): photographs, documents, recordings and links from four communities (Bene Israel, Cochin, Baghdadi, Bnei Menashe, plus "General India"). The users are mostly volunteers in their seventies; half work in Hebrew (RTL).

The life of an item:

```
contribute (/upload) ──► AI reads it (Gemini, suggestions only) ──► contributor checks the suggestions
        │                                                                │
        └────────────── "send without waiting" ──────────────────────────┤
                                                                         ▼
                                     pending in the review queue (/review, oldest first)
                                                                         ▼
                      a content expert verifies field by field, chooses a category, publishes
                                                                         ▼
                      public record (/portal/[id]) — searchable, filterable, translatable,
                      commentable; corrections from the public wait for an expert
```

Stack: **Next.js 16 (App Router, `src/proxy.ts` instead of middleware), React 19, TypeScript, Tailwind, Supabase (Postgres + RLS + Storage + Auth), Gemini, nodemailer over Gmail SMTP, Vercel (hosting + crons), Vitest, Playwright.**

> This Next.js is newer than most training data. Before writing Next code, read the relevant page in `node_modules/next/dist/docs/`. `params`/`searchParams` are Promises; `cookies()` is async.

---

## 2. The five boundaries you must not cross

1. **AI output never lands in `items`.** It goes to `ai_analyses` and `item_fields` rows with `source = 'ai'`. Only a human decision in the workbench (or bulk review, or an accepted correction) writes to `items`.
2. **Never invent technical metadata.** Size, dimensions and duration are measured from the bytes; unknown is `null` and the UI says "not measured".
3. **No React component talks to Supabase.** Reads go through `src/lib/items/queries.ts` (and the other `queries.ts`/`load.ts` files); writes go through `src/lib/items/mutations.ts` (and `src/lib/vocabulary/mutations.ts`).
4. **Permission is enforced three times** — RLS in `supabase/migrations`, the route handler, and the render. A feature that changes who can do what needs all three, plus `../PILOT WITH EREZ/04 — Permissions and Security.md`, plus Inon's explicit approval.
5. **Secrets are server-only.** `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GMAIL_APP_PASSWORD` never get a `NEXT_PUBLIC_` prefix, never appear in logs, and `.env*` files are never printed.

Also: the site is **light only** (no dark mode, anywhere); every user-facing string is in `src/lib/i18n/messages.ts` (English) and `src/lib/i18n/locales/he.json` (Hebrew, written by hand); Gemini's free tier is **20 calls a day** — never spend them on tests or reproduction.

---

## 3. Map of the repository

```
src/app/                      pages and API routes (App Router)
  page.tsx                    home: hero, counts, "Recently added" (catalogued + published only)
  portal/page.tsx             public archive: full-word search + advanced filters (all in the URL)
  portal/[id]/page.tsx        public record: media, fields (linked when shared), credit line,
                              approver name, comments, "suggest a correction", edit link for owners
  upload/page.tsx             the contribution flow (component: upload-flow.tsx)
  review/page.tsx             queue: My drafts → ready (oldest first) → reading incomplete;
                              grid/list toggle, multi-select, bulk approve; "published without a category"
  review/[id]/page.tsx        the workbench (component: review-workbench.tsx)
  review/corrections/         public corrections awaiting a decision (from → to diff)
  manage/                     admin: accounts, bin, families, vocabulary, problems
  login/, login/forgot, login/reset   sign-in, account request, password reset
  receipt/[id]                contributor's private link (edit while pending)
  corrections/[id]/objection  uploader's "please don't apply this change" page
  api/…                       every server write; see §5

src/components/               presentational components; data arrives as props
  upload-flow.tsx             3-step upload; step indicator jumps back; edits survive going back
  pre-review.tsx              contributor's check of the AI reading; TagPicker searches the whole
                              vocabulary and can propose a new term
  review-workbench.tsx        the expert's screen; new features are mounted as small components:
                              review-draft-*, review-candidates, review-read-only,
                              review-server-actions (duplicates, re-read), collector-credit-editor
  review-queue.tsx, review-bulk-table.tsx   list view and bulk approval table
  record-feedback.tsx         public comments + correction form
  record-edit-link.tsx        server component: shows "Edit" only to who may edit
  portal-filters.tsx, related-value.tsx     filters/chips and linked field values

src/lib/
  items/queries.ts            ALL item reads (search/facets in portal-facets.ts, queue order in
                              review-order.ts, duplicates/retry reads re-exported)
  items/mutations.ts          ALL item writes (create, review decision, drafts, bulk, collector,
                              corrections, duplicates merge, re-read)
  items/status.ts             allowed status transitions
  items/edit-permission.ts    the "uploaded or approved" rule in TypeScript (mirrors SQL)
  items/review-handler.ts     the single review decision path used by single AND bulk review
  items/background-reading.ts / retry-*.ts   reading after "send without waiting"; nightly retries
  ai/                         provider interface; gemini.ts, mock.ts (no key = labelled simulator),
                              prompt.ts (the reading prompt, incl. the community-terms rule)
  fields/registry.ts          the catalogue tree (every field, its group, its type)
  translate/                  machine translation of record text into he/hi/mr/ml (render.ts = present())
  vocabulary/                 keywords, variants, translations, candidates (AI or contributor)
  mail/                       nodemailer + templates (receipt, published, notices, recovery, feedback)
  files/                      paths, validation, measuring, renditions, SHA-256 (hash.ts browser,
                              server-hash.ts server — the server one is the source of truth)
  i18n/                       messages.ts (en), locales/*.json; .sources.json = hash of the English
                              source per key, used by `npm run i18n` to know what is stale
  supabase/                   server.ts (session client, getCurrentVolunteer/getCurrentAdmin),
                              admin.ts (service role — server only)
  rate-limit.ts               in-memory limiter (per instance; good enough against casual spam)

supabase/migrations/          0001…0037, applied in order. Never edit an applied migration.
tests/unit/                   Vitest (≈554 tests). tests/e2e/ Playwright (permissions, admin).
scripts/                      deploy, backup, seed, translate-ui, backfill-checksums, guides/capture
docs/                         RUNBOOK (incidents), decisions-2010 (Inon's decisions), phase reports
```

---

## 4. Data model in one screen

| Table | What | Who reads / writes |
|---|---|---|
| `items` | the record. `status` pending/accepted/rejected/shadow_gallery; `category` (NULL = not catalogued → never public); `deleted_at` = in the bin; `reviewed_by`, `uploaded_by`; `collector_name`, `collector_credit_required` | public reads accepted+public+not binned+catalogued; experts write via policies (0036 rule for accepted rows) |
| `item_files` | files of an item; `checksum` = SHA-256 | via items |
| `ai_analyses` | the machine reading per file; `status` succeeded/failed/pending; `retry_count`, `last_retry_at` | experts only |
| `item_fields` | catalogue values, `source` contributor/ai/expert | experts write (0036) |
| `keywords`, `keyword_translations`, `keyword_candidates` (`source` ai/contributor, `item_id`) | vocabulary | public reads keywords; experts judge candidates |
| `families`, `item_families`, `contributors`, `item_contributors` | people | contributors are experts-only |
| `item_translations` | machine translations of record text | public reads for public items |
| `item_duplicates` | suspected duplicate pairs, resolution | experts |
| `review_drafts` | an expert's unsaved review work | own rows only |
| `record_comments` (+ view `public_record_comments` without email) | public comments | public reads the view; writes only via route |
| `record_corrections` | proposed corrections, objections | experts only; writes only via route |
| `profiles` | `role` pending/volunteer(=content expert)/admin; notify prefs | — |
| `problems` | error log with codes (E-XXXXXX) | admins |

Roles: `pending` (no rights), `volunteer` (shown as **Content expert / מומחה תוכן**), `admin` (= "super admin"; there is no separate role — Inon's decision 20.10.2026).

---

## 5. Request paths worth knowing

| Path | What it does | Guard |
|---|---|---|
| `POST /api/uploads/sign` | signed upload URL into the private `heritage` bucket | public, validated, size/type limited |
| `POST /api/analyze` | Gemini reading (counts against the daily quota) | public, rate limited |
| `POST /api/items` | creates an item: forces `pending`, stores checksums, flags duplicates, records contributor tag proposals, sets `uploaded_by` for signed-in experts | public, Zod |
| `POST /api/items/[id]/review` / `POST /api/items/bulk-review` | the decision (same handler); publishing needs a category | expert; accepted records need the 0036 rule |
| `PUT/DELETE /api/items/[id]/draft` | review drafts | expert, own |
| `/api/items/[id]/duplicates` | not-a-duplicate / merge into older | expert (+0036 rule for published) |
| `/api/items/[id]/reread`, `/api/cron/reread` | retry a failed reading (cron daily 01:15 UTC, ≤ `AI_RETRY_DAILY`, 3 tries max) | expert / cron secret |
| `/api/records/[id]/feedback` | public comment or correction (honeypot, timing, rate limit) | public |
| `/api/corrections/[id]/decision`, `/objection` | accept/decline; uploader's objection via signed link | expert / signed token |
| `/api/auth/forgot`, `/api/auth/reset` | password reset by our own email; always a neutral answer | public, rate limited |
| `GET /api/files/[fileId]` | serves files through short signed URLs; public files inline, no download | visibility checked with service role |

---

## 6. How to work here

```bash
npm install
npm run dev               # localhost:3000 — talks to the REAL Supabase project in .env.local; be careful
npm run verify            # typecheck + lint + vitest + build — must be green before any commit
npm run test:e2e          # Playwright permission suite (needs test accounts)
```

- **Two Vercel projects deploy this repository, both on the same Supabase project.** `ijhc-heritage-portal` (the Center's team, indianjews) is the long-term home: connected to GitHub, it deploys every push to `master` to **ijhc-heritage-portal.vercel.app** and runs the crons (backup, translate, reread). Its environment variables are managed from the Center's Vercel account only. `heritage-portal` (Inon's account e-m1) serves **heritage-portal-snowy.vercel.app**, kept as a backup until the domain is connected; its crons were disabled on 27.09, and it is deployed only from the CLI: `npx vercel --prod --yes` in the main code folder. The two can hold different `GEMINI_API_KEY` values: check which project a failure came from before diagnosing it. Never run the CLI from a worktree such as `../ijhc-autofix`: it creates a new project. Measured 21.10.2026.
- **Migrations are applied by hand** in the Supabase dashboard SQL editor (project `llfwnitakmhuyexvqvft`), each wrapped in `begin; … commit;`, **before** the code that needs them is pushed. Record each in `docs/RUNBOOK.md` with how to undo it.
- **Strings**: add the key to `messages.ts` and `he.json` by hand. `npm run i18n` machine-translates hi/mr/ml and **costs Gemini calls** — run it deliberately, not in a loop.
- **Tests**: every new piece of logic gets a unit test. Do not delete or skip a test to get green; if behaviour changed on purpose, update the test and say so in the commit.
- **Docs that must follow a feature**: `../PILOT WITH EREZ/PROGRESS.md`, `01 — System Specification.md`, and `04 — Permissions and Security.md` when permissions change; then `npm run sync:vault`.
- **Bug reports** come from the Center's sheet "Contributors Reports .xlsx" and by email; the `ijhc-fixer` scheduled agent triages them into branches `fixes/<id>` in the worktree `../ijhc-autofix`. It never deploys.

## 7. Things that look wrong but are deliberate

- Field **values**, keyword names without a translation and `source` are shown in the original language even when the interface is translated.
- Uncatalogued items (category NULL) are invisible to the public even when `status = accepted`; they wait on `/review` under "Published without a category".
- The review queue is oldest-first, with items whose AI reading failed or is still running placed after the readable ones.
- A comment appears immediately; a correction never changes the live record until an expert accepts it.
- Screenshots cannot be blocked on the web. Public media only blocks right-click, drag and the players' download buttons.
- Rate limits are per server instance (in memory); good against casual abuse, not against a determined attacker.
