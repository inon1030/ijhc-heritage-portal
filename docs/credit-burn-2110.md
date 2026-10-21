# Credit burn — 21.10.2026

## Plan (before implementation)
1. Add a shared translated attribution builder, Pango-safe names and a light appended image band.
2. Cache JPEG derivatives in private heritage/renditions, keyed by file, checksum, variant, credit and renderer version; authorize every request before reading cache.
3. Route public images through the derivative; experts retain originals; keep existing visibility decisions.
4. Reuse attribution on the record; inspect viewer applicability; add unit and route tests, then verify offline.

## Decisions
- Append the paper-coloured band below the image so no historical subject is covered.
- Burn English labels with original Hebrew/English names; page attribution follows the UI language.
- Use private no-store responses and Vary Cookie/Authorization; persistent private storage avoids repeated rendering without caching authorization decisions.
- Include selected source path in cache identity; never overwrite masters; failed rendering is logged and not cached.
- Keep full names on the page; truncate only image names; omit absent parts and always credit the Center.
- Existing lightbox previews local, not-yet-uploaded files and has no record attribution; the published record has no lightbox.
- No video, audio or PDF burn; preserve byte ranges for those formats.
- Do not edit sibling pilot documents or sync the vault because this task explicitly confines writes to this worktree.
- Work-state tool unavailable: approval required while policy is never; this report tracks implementation state.

## Implementation and verification
- Implemented shared credit text and Pango escaping in src/lib/files/credit-text.ts; all four label keys have hand-written Hebrew and SHA-256 source hashes.
- Implemented sharp/Pango JPEG composition in src/lib/files/credit-band.ts, with bundled Heebo resolved from process.cwd(), 18–48px appended paper band, and a <160px skip rule.
- Updated files GET: existing authorization precedes cache reads; public master/rendition/thumb use credit derivatives; experts receive the original master for every variant.
- Stored derivatives use renditions/credits/<hash>.jpg in the private heritage bucket; the hash includes file ID, checksum, selected path, variant, rendered credit and renderer version. Cache write failure still serves the rendered image. Credit edits select a new key immediately. Old derivatives are not deleted by this feature.
- Updated the published record credit line independently of collector_credit_required; omitted missing names rather than inventing attribution. No record lightbox exists; the upload-only local lightbox has no record attribution to display.
- Added font and OFL tracing via /api/files/*, following the installed Next 16 output.md. Deployment trace contents remain unverified without a build.
- npm run verify: typecheck and lint passed; default Vitest config bundling failed with Access is denied in esbuild before the build stage.
- Full alternate test run with --configLoader native passed 65 files / 579 tests; subsequently added one passing EXIF/transparency case.
- A subsequent fully parallel run had one timing-sensitive failure in existing review3-ui.test.tsx (category input not yet mounted); no test was weakened or edited. Retesting the full suite with two workers.
- Build was not reached by verify; a standalone normal Next build loads .env files and fetches Google fonts, contrary to this task's offline/no-.env constraints, so it was not run.
- Fontconfig emitted cache-directory warnings in the sandbox, but real Pango Hebrew rasterization and glyph-pixel assertions passed. Temporary PNGs were removed.

## Three additional edge cases handled
1. EXIF rotation is applied before positioning the band; transparent pixels flatten onto paper rather than black.
2. User-supplied bidi overrides/control characters cannot introduce extra credit lines or reorder the surrounding labels.
3. A rejected cache-upload promise still returns the successfully burned image and records a problem instead of losing the credit or failing the request.

## Out of scope / handoff
- Video, audio and PDFs are unchanged; existing media range support remains covered by tests.
- No schema, permissions, dependencies, package.json, master-file writes, network calls, git commands, deploy or external documentation writes.
- Pilot documents and Obsidian sync were intentionally not updated: they are outside this worktree, and the task forbids writes there.
- Proposed commit: הוספת צריבת קרדיט בהירה לתמונות ציבוריות ושורת זכויות דו־לשונית

## Final result
- Final full suite: npm run test -- --configLoader native --maxWorkers 2 — 65 files / 580 tests passed (baseline supplied: 63 / 554; +26 tests).
- Final typecheck passed; full lint passed during verify and changed-file lint passed after the final edits.
- Existing review3-ui timing failure did not reproduce with two workers; no assertions or test timeouts were changed.
- Implementation complete within the worktree; production build and deployed font trace verification remain outstanding for the reasons above.
