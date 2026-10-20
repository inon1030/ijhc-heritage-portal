# Phase 2 server — 20.10.2026

## Plan

1. A: recovery links through the existing SMTP transport; neutral asynchronous replies, bounded in-memory address/IP limits, SSR recovery verification and password update without profile changes.
2. B: browser hash helper for the parallel agent; authoritative storage checksums during creation; canonical duplicate pairs and transactional merge in migration 0034; expert controls, mail warning and dry-run backfill.
3. C: migration 0035 adds retry counters and atomic claims; daily bounded retry route and expert retry control reuse background reading.
4. D: public media interaction deterrents and inline delivery; review access retained; no claim of screenshot prevention.
5. Add offline unit tests, run `npm run verify`, record outcomes and merge handoff.

## Decisions

- All work stays in this worktree; no git, services, migrations, backfill, deployment or vault sync will run.
- Existing `/login/*` routes are public; `proxy.ts` needs no change.
- The project specification/progress outside this worktree cannot be updated under this task's explicit boundary.
- Tool discovery for Life OS/work-state returned unsupported; this local document records the implementation handoff.
- Use existing tokens and labelled 44px controls, hand-written English/Hebrew messages, and no dependencies.
- Recovery throttling uses a bounded instance-local map: 3 requests/address/hour and 10/IP/hour; addresses are SHA-256 keys, expired buckets are removed, and full capacity fails closed.
- Recovery responses are identical even for malformed, unknown and throttled addresses; account lookup and SMTP delivery run after the response to avoid a timing oracle.
- Recovery emails use the request reader's language; the token is redeemed on password-form POST so email scanners cannot consume it by opening the link.
- Password limits match account requests (10–200 characters); `verifyOtp` establishes the SSR session and `updateUser` changes only the password, never the profile or approval.
- Browser SHA-256 reads 1MB chunks with event-loop yields, then uses async Web Crypto; Web Crypto has no streaming digest, so up to 50MB is retained for the one real SHA-256 operation.
- The only actual `/api/uploads/sign` caller is `upload-flow.tsx:471`; it is untouched and the exported `uploadSignBody(file)` is the permitted merge handoff.
- Original storage objects are hashed sequentially before item insertion; no caller-provided hash is trusted or copied into `item_files.checksum`.
- Duplicate detection compares canonical UUID pairs, prioritizes identical content over name/type/size, excludes binned items and preserves already resolved decisions.
- 0020 dropped the old `item_contributors`; 0034 recreates it as a contributor-ID junction, with the existing contributor register's expert-only visibility.
- Merge locks both records in UUID order, retains the older `(created_at,id)` record, moves originals, avoids primary-file index conflicts, preserves contributor links and records both audit events atomically.
- A merge explicitly inherits the older record's visibility; the confirmation warns experts before any mutation, including when that record is public.
- Admin bin restoration restores the moved originals using the merge audit; if files have subsequently moved elsewhere, it aborts rather than restoring an empty/incomplete record.
- Existing new-submission mail is bilingual because watchers have no stored locale; the duplicate warning follows that template and comes from the hand-written English/Hebrew catalogues.
- Automatic retries operate on the latest reading per file, so one claimed entry means one call to the existing provider path; at most 3 retries, with a 2-hour pending lease.
- Retry claims increment the counter before execution, so a killed process counts; row locking prevents overlapping manual/cron claims, and generation predicates reject stale completions.
- Cron is at 01:15 UTC, separate from 20:15 translation and 21:45 backup; daily automatic retries default to 5, allow 0 to disable, and cap configured values at 20.
- Automatic retries revisit a given reading at most once per UTC day; manual retries count toward the same per-reading limit and never interrupt a fresh pending reading.
- Retry routes share the background reader's overall deadline; this does not change the existing provider's internal model-fallback behavior.
- Both new tables are included in the existing backup table inventory; no backup was executed.
- Public file responses stream inline without a filename, preserve HTTP byte ranges and are not cached; expert redirects remain private/no-store.
- Public image/audio/video/document-link interactions are deterred and public media is hidden in print; screenshots, browser PDF viewer menus and deliberate saving remain technically possible.
- English/Hebrew strings and Hebrew source hashes are maintained by hand/local hashing; no translation service or translation script ran.
- Vitest's config now uses `fileURLToPath(import.meta.url)` so the same unchanged suite can use Vite's `runner` loader when the default esbuild config bundler cannot traverse the sandbox.
- `scripts/offline-fonts.cjs` is a compile-test fixture only: it prevents Google Fonts requests; never deploy the resulting `.next` output or use this fixture for a production build.

## Verification

| Check | Before (provided baseline) | After |
|---|---|---|
| TypeScript | Green | `npm run typecheck` passed |
| ESLint | 0 errors, 2 warnings | 0 errors, the same 2 existing warnings in `translation-deck.test.tsx` |
| Unit tests | 46 files / 412 tests | `npm run test -- --configLoader runner`: 52 files / 461 tests passed |
| Build | Green | Offline Webpack compile/build passed; standard Turbopack build is blocked by the existing external `node_modules` junction |
| Exact acceptance gate | Green | `npm run verify` is **not green**: default esbuild configuration loading fails on denied ancestor-directory access before tests start |

The alternative runner executes every existing and new unit test; none were skipped, weakened or deleted. New tests cover recovery neutrality, limits, expiry, pending-account behavior, hash vectors/chunk boundaries, claim limits, expert route authorization, merge confirmation, RTL labels, media deterrents and HTTP range handling. SQL was reviewed but not applied or integration-tested against PostgreSQL, as required by the task.

## Files and merge boundaries

| Area | Files |
|---|---|
| A | `src/lib/auth/recovery.ts`; `src/lib/mail/recovery.ts`; `src/app/api/auth/{forgot,reset}/route.ts`; `src/app/login/{forgot,reset}/page.tsx`; `src/components/password-recovery-form.tsx`; `src/components/login-form.tsx` |
| B | `supabase/migrations/0034_duplicates_are_flagged.sql`; `src/lib/files/{hash,server-hash}.ts`; `src/lib/items/duplicate-queries.ts`; `src/app/api/items/[id]/duplicates/route.ts`; `src/app/api/uploads/sign/route.ts`; `src/app/api/items/route.ts`; `src/lib/mail/templates.ts`; `scripts/backfill-checksums.ts` |
| C | `supabase/migrations/0035_a_failed_reading_is_tried_again.sql`; `src/lib/items/{retry-policy,retry-reading,retry-queries,background-reading}.ts`; `src/app/api/cron/reread/route.ts`; `src/app/api/items/[id]/reread/route.ts`; `vercel.json` |
| B/C shared | `src/lib/items/{mutations,queries}.ts`; `src/components/review-server-actions.tsx`; `src/components/review-workbench.tsx`; `src/app/api/cron/backup/route.ts` |
| D | `src/components/public-media.ts`; `src/components/{file-preview,playable-video}.tsx`; `src/app/api/files/[fileId]/route.ts`; `src/app/globals.css` |
| Language | `src/lib/i18n/messages.ts`; `src/lib/i18n/locales/he.json`; `src/lib/i18n/locales/.sources.json` |
| Verification | `tests/unit/{phase2-policy,recovery-routes,phase2-server,phase2-routes,phase2-files-route}.test.ts`; `tests/unit/phase2-ui.test.tsx`; `tests/unit/requests-storage.test.ts`; `vitest.config.ts`; `scripts/offline-fonts.cjs` |
| Handoff | This document |

**AVOID-list touch:** `src/lib/items/queries.ts`, exactly lines **2 and 3**, two new re-exports only:

```ts
export { readDuplicates } from './duplicate-queries';
export { readRetryState } from './retry-queries';
```

No listing/search function changed. No other AVOID-list file changed. The allowed workbench integration is similarly additive: import at line 4 and `<ReviewServerActions itemId={item.id} />` at line 183.

**Upload merge handoff (not applied here):**

```ts
import { uploadSignBody } from '@/lib/files/hash';
// At the existing sign fetch, replace only its JSON body's construction:
body: JSON.stringify(await uploadSignBody(file))
```

Use the existing caller's File variable. The helper returns the existing fileName/mimeType/byteSize fields plus the optional checksum; server hashing already operates without this hookup.

## SQL summary

| Migration | Effect |
|---|---|
| 0034 | Duplicate pairs, uniqueness/reason/resolution checks and lookup indexes; contributor junction; expert-read RLS and expert-update policy with browser UPDATE grant revoked; service-only detection/atomic merge functions; bin-restore trigger; pinned search paths; no existing policy loosened |
| 0035 | `retry_count` (0–3), `last_retry_at`, retry/latest-file indexes; service-only `claim_reading_retry` checks actor/item eligibility, latest reading, lease and count, and claims one row with `FOR UPDATE SKIP LOCKED` |

## Not done and why

- Exact `npm run verify` acceptance remains blocked by the sandbox/esbuild and external node_modules/Turbopack environment; alternative full tests and an offline Webpack build do not erase this limitation.
- Browser hash hookup is reserved for the other agent's `upload-flow.tsx`, as explicitly requested; the helper and authoritative server hash are implemented.
- No schema was applied, backfill run, AI/SMTP/storage call made, deployment performed, git command used, or vault synced.
- No real-browser 375px visual check or live recovery email test was run: starting a dev server/e2e and contacting services were prohibited; RTL, labels, controls and behavior were unit-tested.
- The external progress/specification documents were not edited because only this worktree is writable/authorized.
- Copyright text belongs to phase 2b and was deliberately not implemented; screenshot blocking is not feasible on the web.

## Three additional edge cases handled

1. A mail scanner opening the one-use recovery URL does not consume it, and a password mismatch is rejected before redemption.
2. A merged item's primary file cannot collide with the retained record's unique primary-file index; restoring from the bin recovers originals rather than an empty shell.
3. Video/audio seeking retains byte-range responses, while an expert's signed redirect cannot enter a shared public cache.

## Proposed commits (Claude owns git)

1. `הוספת איפוס סיסמה מאובטח ודואר מותאם לשפה`
2. `זיהוי כפילויות לפי תוכן ומיזוג אטומי עם שחזור`
3. `תור קריאה חוזרת לילי וניסיון ידני למומחי תוכן`
4. `צמצום הורדות במדיה ציבורית ושמירת גישה למומחים`
5. `בדיקות שלב 2 ותיעוד המיזוג והאימות המקומי`

Split shared mutation/query, UI and i18n hunks by feature when committing; no commit was created here.
