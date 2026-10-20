# צד הציבור — 20.10.2026

## תכנית לפני קוד
- להוסיף ב־0037 בלבד קרדיט אספן, מקור להצעות תגיות, תגובות ותיקונים עם הפרדת כתובות דוא״ל.
- לחבר קרדיט ו־SHA-256 להעלאה, וחיפוש בכל אוצר המילים עם הצעות תורם נפרדות.
- להציג קרדיט ושם מאשר בלבד, ולחבר רכיב slot לעריכה אם רכיב הסוכן המקביל חסר.
- להוסיף טפסים ציבוריים נגישים, חתימת זמן, מלכודת ספאם, הגבלת קצב ולינקים.
- לאשר תיקונים בעסקה אטומית עם בדיקת הרשאות קיימות, השוואת ערכים מקוריים ואירוע ביקורת.
- להוסיף התראות פרטניות וקישור התנגדות חתום ל־30 יום; GET לא משנה נתונים.
- להריץ verify ולתעד תוצאות; לא להפעיל שירות, מיגרציה, Git, סנכרון או רשת.

## החלטות
- מסמכי המקור מחוץ ל־worktree וסנכרון הוולט לא יעודכנו: הבקשה אוסרת זאת במפורש.
- כלי Life OS ומעקב משימות נדחו בגלל דרישת אישור שאינה זמינה; התיעוד המקומי נשמר כאן.
- התיקונים כפופים להרשאות עריכת פרסום הקיימות, ואינם מרחיבים הרשאות מומחים.
- כתובות תגובות נשמרות בטבלה פרטית; התצוגה הציבורית כוללת עמודות מפורשות בלבד.
- נוספה `items.contributor_language` באותה מיגרציה כדי שמייל עתידי יישלח בשפת ההעלאה; היא אינה משנה הרשאות.
- למידע ישן ללא שפה שמורה נשלח נוסח עברי־אנגלי, כמו בתבניות הקיימות; שפת מומחה נקראת מ־auth metadata כשקיימת.
- `notify_publications=false` מכבה את התראת המאשר; לתורם אין העדפת התראות קיימת במרשם.
- כשהתורם והמאשר הם אותה כתובת נשלח מייל אחד בלבד, הכולל את קישור ההתנגדות של התורם.
- לחיצה על קישור ההתנגדות אינה כותבת דבר; רק שליחת הטופס ב־POST מתעדת התנגדות, פעם אחת, לפני הכרעה.
- התיקון משווה ערכי מקור גם בהגשה וגם באישור; שינוי מאוחר ברשומה או התנגדות חדשה עוצרים אישור ישן.
- `record-edit-link.tsx` לא נמצא: הדף משתמש ב־`RecordEditSlot`, רכיב מפורש שמחזיר null להחלפה במיזוג.
- אין צורך בשינוי `proxy.ts`: רק `/review` ו־`/manage` סגורים בו; הנתיבים הציבוריים החדשים כבר נגישים.
- חיפוש התגיות קורא דפים של 500 רשומות מכל הקהילות ומכל תרגומי המילים; תגית מוצעת אינה נכתבת ל־`items.keywords`.
- תגובות נקראות בדפים של 200 כדי שתגובה חדשה לא תיעלם לאחר התגובה ה־200; תור התיקונים מציג את 200 ההצעות הוותיקות בכל פעם.
- הגבלת הקצב משתמשת במנגנון הזיכרון הקיים: 6 פניות ל־IP ו־30 לפריט בעשר דקות; אינה משותפת בין מופעי שרת ומתאפסת בהפעלה מחדש.
- צריבת קרדיט לתמונה נדחתה: Sharp קיים, אך אין בצינור שכבת טקסט וגופן עברי מאומתת או מדיניות רענון מטמון לקרדיט משתנה; זה אינו שינוי זול ובטוח לבדיקה offline.
- נבדקו תצוגות רכיבים מבודדות בשתי השפות במצב offline; לא הופעל שרת ולא בוצעה בדיקה מול בסיס נתונים או דואר חי.

## מימוש וקבצים

| שינוי | קבצים |
|---|---|
| 1 — קרדיט וזכויות | `collector-fields.tsx`, `collector-credit-editor.tsx`, `upload-flow.tsx`, `app/api/items/route.ts`, `app/api/records/[id]/moderation/route.ts`, `items/mutations.ts`, `types.ts`, `app/portal/[id]/page.tsx` |
| 2 — שם המאשר | `items/queries.ts` — הקרנה של `full_name` בלבד; `app/portal/[id]/page.tsx` |
| 3 — תגיות וחתימת קובץ | `pre-review.tsx`, `vocabulary/load.ts`, `vocabulary/mutations.ts`, `app/upload/page.tsx`, `upload-flow.tsx`, `files/upload.ts`, `app/api/items/route.ts`, `items/mutations.ts` |
| 4 — תגובות ותיקונים | `record-feedback.tsx`, `correction-decision.tsx`, `correction-objection.tsx`, `items/public-input.ts`, `items/public-tokens.ts`, `items/correction-fields.ts`, `items/queries.ts`, `items/mutations.ts`, `mail/templates.ts`, `mail/record-feedback.ts`, הנתיבים החדשים תחת `api/records`, `api/corrections`, `corrections/[id]/objection`, `review/corrections` |
| 5 — מקום לעריכה | `record-edit-slot.tsx`, `app/portal/[id]/page.tsx` |
| משותף | `0037_the_public_may_speak.sql`, `i18n/messages.ts`, `i18n/locales/he.json`, `i18n/locales/.sources.json`, בדיקות ותוצרי QA מקומיים |

נתיבי רכיבים בטבלה יחסיים ל־`src/components`; נתיבי ספריות יחסיים ל־`src/lib`.

## מגע ברשימת AVOID

רק `src/components/review-workbench.tsx`:

- שורה 2: `import { CollectorCreditEditor } from '@/components/collector-credit-editor';`
- שורה 187: `<CollectorCreditEditor itemId={item.id} initialName={item.collector_name} initialRequired={item.collector_credit_required} />`

לא נגעתי בקבצי review קיימים אחרים, בטיוטות, ב־bulk review, בשינוי תפקידים, ב־0036 או ברכיב record-edit-link.
העמוד החדש `src/app/review/corrections/page.tsx` נוצר לפי החריג המפורש בבקשה.

## 0037 — סכימה ומדיניות

המיגרציה **לא הוחלה**. אין יצירת הרחבות: `pgcrypto` ו־`pg_trgm` כבר מופיעים ב־0001, ואין שימוש חדש ב־trigram.

- `items`: שם אספן, חובת קרדיט עם אילוץ שם לא ריק, ושפת ההעלאה לצורך מיילים.
- `keyword_candidates`: מקור `ai/contributor`, קשר `item_id` עם cascade, אילוץ שלתורם יש פריט; ייחודיות AI נשמרת בנפרד מייחודיות הצעת תורם לכל פריט.
- `record_comments`: גוף 1–2000 תווים, זהות/אנונימיות, תאריך ופרטי הסתרה.
- `record_corrections`: diff, הערה, זהות/אנונימיות, סטטוס, פרטי התנגדות/הכרעה ו־hash של קישור ההתנגדות.

| Policy | פעולה ותפקיד | התנאי |
|---|---|---|
| `comments_public_read` | SELECT, anon + authenticated | תגובה לא מוסתרת; הפריט accepted/public, עם קטגוריה, ולא בפח |
| `comments_expert_read` | SELECT, authenticated | `is_volunteer()` |
| `comments_expert_moderate` | UPDATE, authenticated | `is_volunteer()`; הסתרה נרשמת בשם `auth.uid()`, וביטולה מנקה גם את `hidden_by` |
| `corrections_expert_read` | SELECT, authenticated | `is_volunteer()` |
| `corrections_expert_update` | UPDATE, authenticated | `is_volunteer()` גם ב־USING וגם ב־WITH CHECK |

אין מדיניות INSERT לאנונימיים או למשתמשים; יצירת תגובה/הצעה היא דרך route ו־service role.
לציבור ניתנו רק עמודות תגובה בטוחות; `author_email` אינו כלול במענקי SELECT.
`public_record_comments` הוא view מסוג security invoker, ללא מייל, שמסתיר גם שם בתגובה אנונימית.
מענקי UPDATE מוגבלים לעמודות ההסתרה בתגובות ולעמודות ההכרעה בתיקונים.
`decide_record_correction` הוא security invoker: נעילת ההצעה והפריט, בדיקת ערכי המקור וגרסת ההתנגדות, שינוי הפריט והשדות, כתיבת `item_events` והכרעה באותה עסקה. מדיניות עדכון הפריט הקיימת נשארת בתוקף, לרבות 0036 לאחר המיזוג.

## אימות

| בדיקה | לפני | אחרי |
|---|---|---|
| TypeScript | עבר | עבר |
| ESLint | 0 שגיאות, 2 אזהרות קיימות ב־`translation-deck.test.tsx:42` | ללא אזהרות חדשות |
| `npm run verify` | Vitest/esbuild נחסם בגישה לתיקיית־אב | אותה חסימת טעינת config; אין שינוי בסקריפט |
| `npm run test -- --configLoader runner` | לא הורץ לפני השינויים | 60 קבצים, 535 בדיקות עברו |
| build נפרד, עם חסימת רשת | לא הגיע לשלב build | Turbopack דוחה את קישור `node_modules` אל מחוץ לשורש הסנדבוקס |
| תצוגה offline | לא נמדדה | עברית ואנגלית ב־375/390/768/1440; אין overflow, יעדים לפחות 44px, focus נראה |

הבדיקות הקיימות ששונו: `phase1-record.test.tsx` (mocks לקריאות החדשות ולשפה), `requests-storage.test.ts` (mock להצעות תורם), `requests-upload.test.tsx` (assertions נוספים לקרדיט, שפה ו־SHA-256). לא הוסרה או דולגה בדיקה ולא הוחלשה בדיקת התנהגות.
נוספו `public-feedback.test.ts`, `public-feedback-routes.test.ts`, `public-feedback-ui.test.tsx`.
תוצאות, צילומים ומדידות נמצאים ב־`docs/phase3-public-qa/`; הצילומים הם fixtures של רכיבים ולא של אתר מחובר.

## לא בוצע וגבולות האימות

- לא הורצו DB/E2E, לא נשלח מייל, לא הופעל Gemini ולא נכתבו נתונים מרוחקים.
- ה־SQL נבדק בקוד ובבדיקות גבולות סטטיות בלבד; נדרש אימות מול PostgreSQL אחרי מיזוג 0036, מחוץ לסשן המוגבל הזה.
- build production אינו מאומת בגלל קישור התלויות שנחסם בסנדבוקס.
- צריבת הקרדיט האופציונלית לתמונות לא מומשה; בלוק הקרדיט בעמוד כן מומש.
- מסמכי `PILOT WITH EREZ` מחוץ ל־worktree וסנכרון הוולט לא שונו, בהתאם לאיסור המפורש.

## שלושה מקרי קצה

1. עריכת מומחה אחרי שהצעה נפתחה אינה נדרסת: ערכי המקור נבדקים בהגשה ושוב בתוך עסקת האישור.
2. התנגדות שנוספה במקביל לאישור אינה נבלעת: timestamp ההתנגדות נבדק אחרי נעילת שורת ההצעה.
3. תורם שהוא גם המאשר אינו מקבל שני מיילים: הכתובות מושוות ללא תלות ברישיות וברווחים.

## גבולות commit מוצעים — לא בוצעו פקודות Git

1. `הוספת סכימת קרדיט, תגובות והצעות תיקון עם הרשאות מצומצמות`
2. `חיבור קרדיט אספן, תגיות מוצעות וחתימת קובץ לתהליך ההעלאה`
3. `הוספת שיח ציבורי, בדיקת תיקונים, התנגדויות והתראות בשפת הנמען`
4. `הוספת בדיקות גבולות, תיעוד ומדידות נגישות לצד הציבורי`
