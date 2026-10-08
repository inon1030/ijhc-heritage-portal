# Edit after submission — 08.10.2026

- Apply Inon's 08.10.2026 authorization: the existing receipt permits title and contributor-description edits only for a live `pending` record; returning a record to pending re-enables this status-based capability.
- Keep the existing HMAC derivation and bind every read and write to the URL item id; verify before creating any privileged client.
- Enforce permission independently in the receipt render, route preflight, and conditional database UPDATE; re-read after a lost review/bin race and return a localized 409 reason.
- Limit scope to title (200) and contributor description (4,000), matching submission; reject unknown keys and normalize an empty description to null.
- Omit optional field editing: `writeFields` inserts initial rows, mixes contributor and AI provenance, and cannot safely update existing contributor-only rows atomically with the pending gate without a new database write path.
- Reuse `item_events` action `edited`, null actor and JSON `changes.edited_by = contributor`; the existing review history translates this marker and DescriptionOrigin receives the updated contributor description.
- Keep the audit append best-effort like existing review writes: a separate failed audit insert is logged and does not misreport the already committed edit as failed; no migration or new notification system.
- Keep file previews read-only and exclude contributor identity, contact and consent columns from the receipt query and form.
- Preserve drafts after failed saves, prevent duplicate submissions while saving, focus the opened form and restore focus on close; use visible bilingual labels, logical layout and controls at least 44px tall.
- Follow the task's local-only override: no external project documentation, vault sync, database execution, network, dependency changes or git commands.
- Use the local Next 16 route/page/revalidatePath guides; apply Supabase skill security principles locally because network and live database verification are expressly forbidden.
- Apply the React skill checklist to the receipt form and pages; keep focus effects separate from draft changes and wrap long receipt titles at narrow widths.
- Stamp the 17 hand-written Hebrew translations in `locales/.sources.json` using the existing SHA-256 source-hash convention; do not invoke the translation script.
- Retain the last successful save locally so canceling a later draft cannot restore stale initial props while the server refresh is pending.
- For this sandbox's esbuild parent-directory denial, run the unchanged Vitest suite through its runner config loader with a temporary config replacing only `__dirname` with `process.cwd()`; remove that temporary file afterward.
- Run the build with telemetry disabled and outbound proxies disabled; do not change the existing Google Fonts setup or replace fonts with mocks just to obtain a green build.

## Verification

- `npm run typecheck`: passed after implementation and test additions.
- `npm run lint`: passed, 0 errors and the same 2 existing warnings in `tests/unit/translation-deck.test.tsx:42`.
- `npx vitest run --maxWorkers=3`: blocked at config bundling by sandbox denial of an ancestor directory; no tests ran in that invocation.
- `npx vitest run --maxWorkers=3 --configLoader runner --config .verification/vitest.config.ts`: 412 tests passed in 46 files (29 new tests), using the equivalent temporary config described above; no test skipped or weakened.
- The initial full test run caught missing translation source hashes; after adding them locally, the full suite passed.
- `npm run build`: failed because the six existing `next/font/google` families in `src/app/layout.tsx` cannot be fetched with network disabled (Heebo, IBM Plex Mono, Inter, Noto Naskh Arabic, Noto Sans Devanagari, Noto Sans Malayalam); production verification remains incomplete.
- Hebrew/English rendering, 375px RTL container markup, focus, conflict messages and failed-save drafts are covered by component tests; actual browser geometry and live database concurrency were not exercised under the task restrictions.

## Manual checks once a runnable build is available

- A: Open a valid pending receipt, choose Edit what you sent, change title/description, save and reload the same link; files stay read-only and contact/consent fields are absent.
- B: Open published, restricted, rejected, shadow-gallery and binned receipts; each has its appropriate closed sentence and no edit action or form.
- C: Leave an edit form open, publish or bin the item as an expert, then save; expect 409, the new-state sentence and no contributor write; try item A's token on item B and expect 403.
- D: Reload the expert workbench after an edit; inspect the contributor-description origin panel and the localized Edited by contributor history entry; audit insertion is best-effort and separate from the item transaction.
- E: Switch between Hebrew and English and read the receipt-link capability notice, dates/reference, labels and handling-terms link.
- F: Run the verification commands above in a build environment with the existing fonts available; test keyboard navigation and absence of horizontal overflow at 375px in RTL.

## Proposed commit boundaries

- Implementation: receipt capability comment, guarded query/mutation/route, form and receipt/review renders, English/Hebrew strings and their source hashes.
- Tests and documentation: the two contributor-edit test files and this decision/verification record; keep the build blocker visible until resolved.
