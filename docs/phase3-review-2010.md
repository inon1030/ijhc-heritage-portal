# Phase 3 — Review — 20.10.2026

## Plan and decisions
- Preserve the volunteer enum; rename human-facing English and Hebrew labels, excluding public-agent files.
- Enforce published ownership in the existing items UPDATE policy, server handlers and render.
- Keep restore/purge administrator-only; duplicate merges must check both affected records.
- Store private per-expert drafts; validate restoration and retain drafts on failed decisions.
- Bulk approval reuses the single-review pipeline, with a maximum of 50 records.
- Candidate suggestions use existing vocabulary mutations and PostgreSQL trigram matching; missing 0037 columns hide them.
- Keep workbench integration to imports and feature elements passing state explicitly.
- No migrations applied, external docs synced, git commands or environment files accessed.
- Life OS and work-state tools were attempted but blocked by approval policy; progress is recorded here.
- Apply the same published ownership restriction to catalogue fields, family links and human translations, closing direct child-table edits; retain existing read policies.
- Correct OCR/transcript through a session-bound RPC that locks the parent record, preventing a publication race from bypassing the route check.

## Verification
- Baseline `npm run verify` started before code changes.

Rename files: src/app/api/analyze/translate/route.ts, src/app/api/guides/[...path]/route.ts, src/app/api/items/route.ts, src/app/login/page.tsx, src/app/review/page.tsx, src/components/description-origin.tsx, src/components/family-manager.tsx, src/components/field-sheet.tsx, src/components/language-picker.tsx, src/components/masthead-shell.tsx, src/components/masthead.tsx, src/components/site-nav.tsx, src/components/translation-deck.tsx, src/lib/ai/prompt.ts, src/lib/consent.ts, src/lib/guides/catalogue.ts, src/lib/guides/step-text.json, src/lib/guides/step-text.ts, src/lib/i18n/language-lock.ts, src/lib/i18n/locales/he.json, src/lib/i18n/messages.ts, src/lib/items/background-reading.ts, src/lib/items/queries.ts, src/lib/legal.ts, src/lib/mail/recipients.ts, src/lib/mail/templates.ts, src/lib/text/word-diff.ts, src/lib/translate/reading.ts, src/lib/types.ts

Protected remaining occurrences: src/app/portal/[id]/page.tsx, src/components/pre-review.tsx, src/components/review-workbench.tsx, src/components/upload-flow.tsx

## תוצאה

חמשת השינויים מומשו מקומית. האימות אינו ירוק במלואו: פקודת verify הרגילה וה־build חסומים מסיבות סביבה המתועדות להלן. לא הוחלה מיגרציה ולא בוצעה פריסה.

| שינוי | מימוש וקבצים |
|---|---|
| 1 — שם התפקיד | `src/lib/types.ts` כולל ROLE_LABELS; `src/lib/i18n/messages.ts`, `locales/he.json`, `locales/.sources.json`; תבניות מייל, מדריכים, consent/legal וכל הקבצים ברשימת Rename לעיל. enum לא השתנה. |
| 2 — בעלות על רשומה שפורסמה | `0036_an_expert_answers_for_their_own_records.sql`; `items/edit-permission.ts`, `review-guard.ts`, `review-handler.ts`, `mutations.ts`; `api/items/route.ts`; נתיבי review/reading/duplicates/reread/translations; `review/[id]/page.tsx`; `record-edit-link.tsx`, `review-read-only.tsx`. |
| 3 — טיוטות | 0036; `items/draft-schema.ts`, `queries.ts`, `mutations.ts`; `api/items/[id]/draft/route.ts`; `review-draft-controls.tsx`, `review-draft-scope.tsx`; דפי התור והפריט; חיבור בלבד ב־workbench. |
| 4 — רשימה ואישור מרוכז | `review-queue.tsx`, `review-bulk-table.tsx`; `api/items/bulk-review/route.ts`; חילוץ ה־handler הקיים ל־`items/review-handler.ts`, ללא מסלול אישור חלופי; עד 50 רשומות ותוצאה לכל אחת. |
| 5 — תגיות מוצעות | `review-candidates.tsx`; `api/items/[id]/candidates/route.ts`; `items/queries.ts`, `mutations.ts`; פונקציית trigram ב־0036, עם שמות ותרגומים ועד שלוש התאמות. |

הטיוטה כוללת קטלוג, משפחות ותיקוני OCR/תמלול שלא נשמרו. השחזור ממלא את עורכי הקריאה הקיימים; שמירה מפורשת של תיקון קריאה ממשיכה להשתמש בכפתור הקיים של אותו עורך. שמירת טיוטה אינה משנה את הרשומה או את הסטטוס שלה.

## SQL 0036 — פירוט מלא של המדיניות

`can_edit_published(item)` = מנהל, או מומחה תוכן שהוא `uploaded_by` או `reviewed_by`.
`can_edit_record_content(id)` = מומחה מאושר שרואה את רשומת האב, ואם היא פורסמה — עובר את `can_edit_published`.

| Policy | לפני → אחרי |
|---|---|
| `items_volunteer_update` | USING: מומחה + רשומה לא בסל → אותם תנאים, וב־accepted גם `can_edit_published`. WITH CHECK נשאר `is_volunteer()`. |
| `item_fields_volunteer_insert` | CHECK `is_volunteer()` → `can_edit_record_content(item_id)` |
| `item_fields_volunteer_update` | USING ו־CHECK `is_volunteer()` → `can_edit_record_content(item_id)` |
| `item_fields_volunteer_delete` | USING `is_volunteer()` → `can_edit_record_content(item_id)` |
| `item_families_volunteer_write` | CHECK `is_volunteer()` → `can_edit_record_content(item_id)` |
| `item_families_volunteer_delete` | USING `is_volunteer()` → `can_edit_record_content(item_id)` |
| `item_translations_volunteer_write` | USING ו־CHECK `is_volunteer()` → `can_edit_record_content(item_id)`; מדיניות SELECT הנפרדת משאירה את הקריאה למומחים. |
| `review_drafts_own_select` — חדשה | USING `is_volunteer() AND profile_id = auth.uid()` |
| `review_drafts_own_insert` — חדשה | CHECK אותו תנאי |
| `review_drafts_own_update` — חדשה | USING ו־CHECK אותו תנאי |
| `review_drafts_own_delete` — חדשה | USING אותו תנאי |

- `uploaded_by` נוסף כ־FK nullable לפרופיל, עם `ON DELETE SET NULL`; אין backfill.
- טריגרים לטיוטה: timestamp, נעילת רשומת האב ובדיקת גרסת החלטה, ומחיקת טיוטת המחליט בתוך טרנזקציית ההחלטה.
- `correct_review_reading` כותבת רק עמודות תיקון, מאמתת את הסשן ומחזיקה נעילת אב למניעת מרוץ פרסום.
- `resolve_item_duplicate` מוחלפת באותה לוגיקה קיימת, בתוספת בדיקת בעלות על שתי הרשומות תחת הנעילות הקיימות.
- `similar_review_terms` משתמשת ב־pg_trgm שכבר מופעל ב־0001; בלי Gemini.
- מדיניות הקריאה של items ומדיניות הסל למנהל אינן משתנות. לא נוספה אפשרות שחזור או מחיקה לצמיתות למומחה.

## בדיקות — לפני ואחרי

| בדיקה | לפני | אחרי |
|---|---|---|
| TypeScript | עבר | עבר |
| ESLint | 0 שגיאות, 2 אזהרות קיימות ב־translation-deck.test.tsx | 0 שגיאות ו־0 אזהרות |
| `npm run verify` | נעצר בטעינת Vitest: esbuild אינו מורשה לקרוא תיקיית אב | אותה חסימת סביבה |
| Vitest עם `--configLoader native` | לא נמדד baseline מלא | 533 בדיקות, 60 קבצים, 0 כישלונות, 0 דילוגים |
| build | verify לא הגיע אליו | ניסיון נפרד נכשל: `node_modules` הוא symlink מחוץ לשורש של Turbopack |
| E2E / DB | לא הורצו | לא הורצו, בהתאם להוראה |

בדיקות חדשות: `review-permission.test.ts`, `review3-routes.test.ts`, `review3-ui.test.tsx`.
בדיקות קיימות שעודכנו: `consent.test.ts` — שם התפקיד; `phase1-publication.test.tsx`, `phase2-routes.test.ts` — fixtures של תפקיד ורשומה לצורך בדיקת ההרשאה החדשה; `translation-deck.test.tsx` — טיפוס mock ללא פרמטרים לא בשימוש, עם אותן assertions.
נוספו ארבעה מקרי בעלות ל־`tests/e2e/permissions.spec.ts`, ללא הרצה וללא skip. להרצה עתידית נדרשים storage states של מומחה ומנהל ושלושה מזהי רשומות בדיקה: UPLOADED, APPROVED, UNRELATED; שמות משתני ההכנה נמצאים בקובץ הבדיקה.

## מדידות ותוצרים חזותיים

`docs/review-layout/measurements.json` מכיל מדידות Chrome מקומיות ל־Grid, List, Bulk, Candidates ו־Draft, ב־375/390/768/1440, בעברית RTL. בכל 20 המדידות: רוחב המסמך שווה לרוחב החלון, ואין button/select/label שגובהו פחות מ־44px.
באותה תיקייה נשמרו HTML ו־PNG ב־390/768/1440. אלו רכיבים אמיתיים שרונדרו ב־React עם נתוני בדיקה ו־CSS הפרויקט, לא בדיקה של שרת חי או מסד פעיל. כל בקשת HTTP בדפדפן המדידה נחסמה.

## קובץ משותף וגבולות

רק `src/components/review-workbench.tsx` נגע בקובץ המשותף:

- שורות 3, 4, 5: imports.
- שורה 571: אלמנט הצעות תגיות.
- שורה 628: אלמנט טיוטת הקטלוג והעברת state/setters.
- שורה 842: אלמנט גישור לטיוטת הקריאה, ללא UI נוסף בתוך העורך הקיים.

לא נערכו קבצי הצד הציבורי, upload-flow, pre-review או TagPicker. לא הופעלו git, dev, deploy, sync:vault, test:e2e או test:db; package וה־lock לא נערכו.

## נשאר למיזוג / לסביבה

- להציב את `RecordEditLink` בעמוד הרשומה הציבורי — בכוונה הושאר לסוכן הצד הציבורי.
- להחיל את 0036 ולבדוק RLS מול מסד בדיקה; לא בוצע משום שנאסר להחיל מיגרציות או להריץ בדיקות DB.
- להחיל את 0037 של הסוכן האחר כדי להציג מועמדים המשויכים לפריט; בהיעדר העמודות הרכיב ריק.
- להריץ build/verify בסביבה שבה node_modules נמצא בתוך שורש תקין והרשאות esbuild מאפשרות טעינת config.
- עדכון מסמכי PILOT WITH EREZ וסנכרון הוולט הושארו ל־Claude, כפי שהתבקש.
- Life OS ו־work_state לא עודכנו: הכלים הוחזרו כחסומים ב־approval policy never.

## שלושה מקרי קצה שטופלו בלי בקשה נוספת

1. תשובת טעינת טיוטה איטית אינה מוחקת הקלדה שכבר התחילה; טיוטה שלפני החלטה חדשה אינה משוחזרת אוטומטית.
2. autosave מאוחר אינו מקים מחדש טיוטה שהחלטה מחקה: נעילת רשומת האב ובדיקת reviewed_at במסד.
3. localStorage חסום אינו מפיל את בורר התצוגה; העמוד נשאר שימושי וניתן לעבור לרשימה.

## גבולות commits מוצעים

1. `שינוי שם התפקיד למומחה תוכן בממשק ובמדריכים` — תרגומים, ROLE_LABELS, מיילים ומדריכים.
2. `אכיפת בעלות על רשומות שפורסמו ותשתית טיוטות` — 0036, הרשאות, mutations/queries, guards וקישור העריכה.
3. `הוספת טיוטות פרטיות ושחזור תיקוני קריאה` — API הטיוטה, scope/controls והחיבור המינימלי ל־workbench.
4. `הוספת תור ברשימה ואישור מרוכז במסלול האישור הקיים` — queue, bulk table, handler ונתיב bulk.
5. `הצגת תגיות מוצעות ובדיקות שלב הביקורת` — candidates, בדיקות, מדידות והתיעוד; מומלץ squash אם נדרשת כל נקודת commit עצמאית, כי המיגרציה וה־i18n משותפים.

## Remaining protected rename occurrences

- `src/app/portal/[id]/page.tsx:264` - comment only; deferred to merge.
- `src/components/pre-review.tsx:435` - comment only; deferred to merge.
- `src/components/upload-flow.tsx:281` - comment only; deferred to merge.
- `src/components/upload-flow.tsx:302` - comment only; deferred to merge.
- `src/components/upload-flow.tsx:587` - comment only; deferred to merge.
- `src/components/review-workbench.tsx:361` - comment only; deferred to merge.
- `src/components/review-workbench.tsx:411` - comment only; deferred to merge.
- `src/components/review-workbench.tsx:620` - comment only; deferred to merge.
