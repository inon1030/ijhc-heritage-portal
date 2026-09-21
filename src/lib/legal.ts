import { GEMINI_PAID_TIER } from '@/lib/consent';

/**
 * The three documents a public archive is required to publish, written from
 * what this system actually does.
 *
 * Every sentence here is checkable against the code: the cookies named are the
 * cookies set, the processors named are the ones the app talks to, the region
 * is the region the database is in (`eu-central-1`, verified 16.09.2026), and
 * the accessibility gaps listed are gaps that were measured rather than
 * guessed at. Nothing promises a behaviour the archive does not have.
 *
 * ── what is deliberately left blank ─────────────────────────────────────────
 *
 * Three facts belong to the Center and cannot be invented here: the address
 * that receives privacy requests, the name and phone of the person responsible
 * for accessibility, and the Center's registration details. Where they are
 * missing the page says so, in the reader's language, instead of printing a
 * plausible-looking placeholder. An accessibility statement naming a
 * coordinator who does not exist is worse than one admitting the line is not
 * filled in yet — the statement is a legal undertaking, not a page decoration.
 *
 * English and Hebrew are written by hand. The other three languages of the
 * archive show the English, marked, because a machine translation of a legal
 * undertaking is not an undertaking.
 */

export interface LegalClause {
  heading: string;
  body: string[];
  /** Rendered as a list under the paragraphs. */
  list?: string[];
}

export interface LegalDocument {
  title: string;
  standfirst: string;
  updated: string;
  clauses: LegalClause[];
  /** Shown where the Center still has to fill something in. */
  missingContact: string;
  missingOfficer?: string;
}

/** The day these documents were last written. Changed by hand, with the text. */
export const LEGAL_UPDATED = '2026-09-21';

const aiParagraphEn = GEMINI_PAID_TIER
  ? 'The Center uses this service on a paid account. Under Google’s paid terms the material sent is not used to train or improve Google’s models. It still leaves the Center’s systems to be read.'
  : 'The Center currently uses this service on Google’s free tier. Under the free terms, Google may use what is sent to it — including the file itself — to improve its services. Anyone who would rather their material were not read this way should not upload it, and can write to the Center instead.';

const aiParagraphHe = GEMINI_PAID_TIER
  ? 'המרכז משתמש בשירות הזה בחשבון בתשלום. לפי תנאי השימוש בתשלום של גוגל, החומר שנשלח אינו משמש לאימון או לשיפור המודלים שלה. עם זאת, החומר עדיין יוצא מהמערכות של המרכז כדי להיקרא.'
  : 'המרכז משתמש כיום בשירות הזה במסלול החינמי. לפי תנאי המסלול החינמי, גוגל רשאית להשתמש במה שנשלח אליה, לרבות בקובץ עצמו, כדי לשפר את שירותיה. מי שמעדיף שהחומר שלו לא ייקרא כך, מוטב שלא יעלה אותו לכאן ויפנה למרכז ישירות.';

export const PRIVACY: Record<'en' | 'he', LegalDocument> = {
  en: {
    title: 'Privacy',
    standfirst:
      'What this archive keeps about a person, who else sees it, and how to have it removed.',
    updated: LEGAL_UPDATED,
    missingContact:
      'The Center has not yet published the address that receives these requests. Until it does, ask whoever gave you the link to this archive to pass your request on.',
    clauses: [
      {
        heading: 'Who holds this material',
        body: [
          'The archive is run by the Indian Jewish Heritage Center, together with the Cochin Jewish Heritage Center. The Center decides what the archive contains and what is published.',
        ],
      },
      {
        heading: 'What is collected, and why',
        body: ['Three kinds of thing, and nothing else:'],
        list: [
          'What a contributor sends: the file itself, and the description, dates, places and names given with it. This is the archive’s subject matter and it is kept for as long as the archive exists.',
          'An email address, and a name if one is given. The address is required in order to contribute. It is used for three things only: a Moderator coming back with a question about the item, a message with the receipt link when the item is sent, and a message with the item’s public link when it is published. It is never published beside a record and it is never used for a newsletter.',
          'An account, for the Moderators who review items: a name, an email address, and a password the Center never sees in readable form.',
        ],
      },
      {
        heading: 'Family names',
        body: [
          'A family name attached to a record is published with it, because a heritage archive that cannot be searched by family is not much of a heritage archive. That also means the surname of living relatives can appear in public.',
          'A name is attached by a Moderator, from a list the Center maintains, and only where the name is already part of the historical record. A contributor’s own name is not published merely because they gave it.',
        ],
      },
      {
        heading: 'The machine that reads the file',
        body: [
          'Every uploaded file is read by an automated service, Google Gemini, which proposes a description, a period, a place and keywords. A person checks that reading against the original before anything is published; nothing the machine produces is published unread.',
          'To be read, the file is sent to Google. It leaves the Center’s systems at that moment.',
          'While reading, the service may also search the web for background on what it sees — a place, a community, a kind of object. What such a search finds is shown to the Moderator as unverified background, apart from the catalogue, and is never written into a record as fact.',
          aiParagraphEn,
        ],
      },
      {
        heading: 'Where the data sits',
        body: [
          'Records, files and accounts are held by Supabase in Frankfurt, in the European Union. The site itself is served by Vercel, also from Frankfurt. Both keep technical logs of requests, which include IP addresses, for their own operation and security.',
          'The messages the archive sends a contributor go out through the Center’s Google (Gmail) account, so the recipient’s address and the message pass through Google.',
          'The Center also keeps its own copies of the database and the files, so that an accident at a supplier does not end the archive.',
        ],
      },
      {
        heading: 'Cookies',
        body: ['The archive sets as few as it can:'],
        list: [
          'ijhc.lang — the language chosen for the site. A year.',
          'ijhc.theme — light or dark, if either was chosen. A year.',
          'A session cookie, for a signed-in Moderator only. It is what keeps them signed in.',
          'If the Center turns on visitor statistics, those cookies are set only after a visitor agrees, and the choice itself is remembered in a cookie. Declining leaves the archive fully usable.',
        ],
      },
      {
        heading: 'Who else sees it',
        body: [
          'Moderators and administrators of the Center see everything in the review screens, including contributors’ email addresses. Nobody outside the Center is given this material, and none of it is sold or exchanged.',
          'A published record is public by definition: anyone can read it, link to it and copy it.',
        ],
      },
      {
        heading: 'Asking for something to be removed',
        body: [
          'Anyone may ask what is held about them, ask for it to be corrected, or ask for material they sent to be taken down. Anyone may also ask to be erased without withdrawing the material: the name and address are deleted and the item stays in the archive.',
          'A contributor also holds a receipt link, given when the item was sent. It shows what happened to that submission and needs no account.',
        ],
      },
      {
        heading: 'Children',
        body: [
          'The archive is not aimed at children and does not knowingly collect their details. Material showing a child who is now an adult is family history and is treated like the rest of the archive; a request to withdraw it is honoured on the same terms as any other.',
        ],
      },
      {
        heading: 'Changes',
        body: [
          'This page carries the date it was last written. A change that affects what happens to material already sent is announced on the site rather than made quietly.',
        ],
      },
    ],
  },

  he: {
    title: 'פרטיות',
    standfirst: 'מה הארכיון שומר על אדם, מי עוד רואה את זה, ואיך מבקשים להסיר.',
    updated: LEGAL_UPDATED,
    missingContact:
      'המרכז עדיין לא פרסם את הכתובת שאליה נשלחות פניות כאלה. עד אז אפשר לפנות למי שמסר לכם את הקישור לארכיון, והוא יעביר את הבקשה.',
    clauses: [
      {
        heading: 'מי מחזיק בחומר',
        body: [
          'הארכיון מופעל על ידי Indian Jewish Heritage Center יחד עם Cochin Jewish Heritage Center. המרכז הוא שמחליט מה נכלל בארכיון ומה מתפרסם.',
        ],
      },
      {
        heading: 'מה נאסף, ולשם מה',
        body: ['שלושה סוגים של מידע, ולא מעבר לכך:'],
        list: [
          'מה שהתורם שולח: הקובץ עצמו, והתיאור, התאריכים, המקומות והשמות שנמסרו איתו. זה החומר של הארכיון, והוא נשמר כל עוד הארכיון קיים.',
          'כתובת מייל, ושם אם נמסר. הכתובת נדרשת כדי לתרום, והיא משמשת לשלושה דברים בלבד: מודרטור שחוזר עם שאלה על הפריט, מייל עם קישור הקבלה כשהפריט נשלח, ומייל עם הקישור הציבורי לפריט כשהוא מתפרסם. היא לא מתפרסמת לצד רשומה ולא משמשת לדיוור.',
          'חשבון, למודרטורים שבודקים פריטים: שם, כתובת מייל, וסיסמה שהמרכז אינו רואה בשום שלב בצורה קריאה.',
        ],
      },
      {
        heading: 'שמות משפחה',
        body: [
          'שם משפחה שמחובר לרשומה מתפרסם יחד איתה, כי ארכיון מורשת שאי אפשר לחפש בו לפי משפחה הוא ארכיון חסר. משמעות הדבר היא ששם משפחה של קרובים חיים עשוי להופיע בפומבי.',
          'את השם מחבר מודרטור, מתוך רשימה שהמרכז מנהל, ורק כשהשם כבר חלק מהתיעוד ההיסטורי. שמו של תורם אינו מתפרסם רק משום שמסר אותו.',
        ],
      },
      {
        heading: 'המכונה שקוראת את הקובץ',
        body: [
          'כל קובץ שמועלה נקרא על ידי שירות אוטומטי, Google Gemini, שמציע תיאור, תקופה, מקום ומילות מפתח. אדם בודק את הקריאה הזאת מול המקור לפני כל פרסום, ושום דבר שהמכונה מייצרת אינו מתפרסם בלי שנקרא.',
          'כדי שהקובץ ייקרא, הוא נשלח לגוגל. באותו רגע הוא יוצא מהמערכות של המרכז.',
          'תוך כדי הקריאה השירות עשוי גם לחפש ברשת רקע על מה שהוא רואה - מקום, קהילה, סוג של חפץ. מה שחיפוש כזה מוצא מוצג למודרטור כרקע שלא אומת, בנפרד מהקטלוג, ולעולם אינו נכתב לרשומה כעובדה.',
          aiParagraphHe,
        ],
      },
      {
        heading: 'איפה המידע יושב',
        body: [
          'הרשומות, הקבצים והחשבונות מאוחסנים אצל Supabase בפרנקפורט, באיחוד האירופי. האתר עצמו מוגש על ידי Vercel, גם הוא מפרנקפורט. שתי החברות שומרות יומני בקשות טכניים, הכוללים כתובות IP, לצורכי תפעול ואבטחה.',
          'המיילים שהארכיון שולח לתורמים יוצאים דרך חשבון Google (ג׳ימייל) של המרכז, ולכן הכתובת של הנמען ותוכן המייל עוברים דרך Google.',
          'המרכז שומר גם עותקים משלו של מסד הנתונים ושל הקבצים, כדי שתקלה אצל ספק לא תחסל את הארכיון.',
        ],
      },
      {
        heading: 'עוגיות',
        body: ['הארכיון משתמש במעט ככל האפשר:'],
        list: [
          'ijhc.lang — השפה שנבחרה לאתר. שנה.',
          'ijhc.theme — בהיר או כהה, אם נבחר. שנה.',
          'עוגיית התחברות, רק למודרטור מחובר. היא זו ששומרת אותו מחובר.',
          'אם המרכז יפעיל סטטיסטיקות מבקרים, העוגיות שלהן ייקבעו רק אחרי הסכמה, והבחירה עצמה תישמר בעוגייה. סירוב משאיר את הארכיון שמיש במלואו.',
        ],
      },
      {
        heading: 'מי עוד רואה את זה',
        body: [
          'מודרטורים ומנהלים מטעם המרכז רואים את הכל במסכי הבדיקה, כולל כתובות המייל של התורמים. החומר אינו נמסר לאיש מחוץ למרכז, ואינו נמכר או מוחלף.',
          'רשומה שפורסמה היא ציבורית מעצם הגדרתה: כל אחד יכול לקרוא אותה, לקשר אליה ולהעתיק אותה.',
        ],
      },
      {
        heading: 'בקשה להסרה',
        body: [
          'כל אדם רשאי לשאול מה מוחזק עליו, לבקש לתקן, או לבקש להסיר חומר ששלח. אפשר גם לבקש להימחק בלי למשוך את החומר: השם והכתובת נמחקים, והפריט נשאר בארכיון.',
          'בידי כל תורם יש גם קישור קבלה שהתקבל בעת השליחה. הוא מראה מה קרה לאותה הגשה ואינו דורש חשבון.',
        ],
      },
      {
        heading: 'ילדים',
        body: [
          'הארכיון אינו מיועד לילדים ואינו אוסף ביודעין את פרטיהם. חומר שמופיע בו ילד שהיום מבוגר הוא היסטוריה משפחתית, והטיפול בו זהה לשאר הארכיון. בקשה להסרה תיענה באותם תנאים כמו כל בקשה אחרת.',
        ],
      },
      {
        heading: 'שינויים',
        body: [
          'בעמוד הזה מופיע התאריך שבו נכתב לאחרונה. שינוי שנוגע לחומר שכבר נשלח יוכרז באתר ולא ייעשה בשקט.',
        ],
      },
    ],
  },
};

export const TERMS: Record<'en' | 'he', LegalDocument> = {
  en: {
    title: 'Terms of use',
    standfirst: 'What this site is, what may be done with what is on it, and what is expected of a contributor.',
    updated: LEGAL_UPDATED,
    missingContact: 'The Center has not yet published an address for questions about these terms.',
    clauses: [
      {
        heading: 'What this site is',
        body: [
          'A digital archive of the Jewish communities of India — Bene Israel, Cochin, Baghdadi and Bnei Menashe — run by the Indian Jewish Heritage Center. Anyone may read it. Anyone may contribute to it without an account.',
        ],
      },
      {
        heading: 'Contributing',
        body: [
          'By sending material you confirm that it is yours to share, or that you have permission from whoever holds it, and you give the Center permission to keep it, describe it and publish it as part of the archive. You do not transfer ownership of it.',
          'Do not send material that shows or names a living person without their agreement, and do not send anything you are not free to share.',
        ],
      },
      {
        heading: 'What the Center may do',
        body: [
          'The Center decides what the archive holds. It may decline a contribution, edit a description, take a published record out of public view, or remove one — without giving a reason, and without undertaking to tell the contributor when the decision is made.',
          'A record removed in the review screens goes to a bin, where an administrator can restore it. Only a deliberate second action destroys it.',
        ],
      },
      {
        heading: 'Using what is published here',
        body: [
          'Records are published so that they can be read, quoted and linked to. Copyright in the material stays with whoever holds it — in most cases a family, not the Center.',
          'For anything beyond personal or scholarly use, including republication or commercial use, ask the Center first.',
        ],
      },
      {
        heading: 'What the descriptions are worth',
        body: [
          'Each description was written or checked by a person, and each catalogue entry says what it rests on: read from the material, or inferred from it. An inference is a considered reading, not a certainty.',
          'Records are published in five languages. Machine translations are marked as such; where a translation and the original differ, the original is what the archive holds.',
        ],
      },
      {
        heading: 'Accounts',
        body: [
          'An account is for reviewing the archive and is approved by an administrator. Keep the password to yourself; tell the Center if you think somebody else has it. An account may be suspended if it is used to publish material that should not be public.',
        ],
      },
      {
        heading: 'Availability',
        body: [
          'The archive is offered as it is. The Center does not undertake that the site will be available without interruption, and is not liable for loss arising from its use. It does undertake to keep more than one copy of what has been entrusted to it.',
        ],
      },
      {
        heading: 'Law',
        body: [
          'These terms are governed by the law of the State of Israel, and the courts of Israel have jurisdiction over any dispute arising from them.',
        ],
      },
    ],
  },

  he: {
    title: 'תנאי שימוש',
    standfirst: 'מה האתר הזה, מה מותר לעשות במה שיש בו, ומה מצופה מתורם.',
    updated: LEGAL_UPDATED,
    missingContact: 'המרכז עדיין לא פרסם כתובת לפניות בנוגע לתנאים אלה.',
    clauses: [
      {
        heading: 'מה האתר הזה',
        body: [
          'ארכיון דיגיטלי של הקהילות היהודיות בהודו — בני ישראל, קוצ׳ין, בגדאדים ובני מנשה — שמפעיל Indian Jewish Heritage Center. כל אחד רשאי לקרוא בו, וכל אחד רשאי לתרום לו בלי חשבון.',
        ],
      },
      {
        heading: 'תרומת חומר',
        body: [
          'בשליחת חומר אתם מאשרים שהוא שלכם לשיתוף, או שיש לכם רשות ממי שמחזיק בו, ונותנים למרכז רשות לשמור אותו, לתאר אותו ולפרסם אותו כחלק מהארכיון. הבעלות אינה עוברת.',
          'אין לשלוח חומר שמציג או מזכיר אדם חי בלי הסכמתו, ואין לשלוח דבר שאינכם חופשיים לשתף.',
        ],
      },
      {
        heading: 'מה המרכז רשאי לעשות',
        body: [
          'המרכז מחליט מה הארכיון מכיל. הוא רשאי לא לקבל תרומה, לערוך תיאור, להוציא רשומה שפורסמה מהעין הציבורית, או להסיר אותה — בלי לנמק, ובלי להתחייב להודיע לתורם בזמן ההחלטה.',
          'רשומה שהוסרה במסכי הבדיקה עוברת לפח, ומנהל יכול לשחזר אותה משם. רק פעולה שנייה ומכוונת מוחקת אותה.',
        ],
      },
      {
        heading: 'שימוש במה שמתפרסם כאן',
        body: [
          'הרשומות מתפרסמות כדי שיקראו אותן, יצטטו ויקשרו אליהן. זכויות היוצרים בחומר נשארות אצל מי שמחזיק בהן — בדרך כלל משפחה, ולא המרכז.',
          'לכל שימוש מעבר לשימוש אישי או מחקרי, לרבות פרסום מחדש ושימוש מסחרי, יש לפנות למרכז מראש.',
        ],
      },
      {
        heading: 'מה ערכם של התיאורים',
        body: [
          'כל תיאור נכתב או נבדק על ידי אדם, וכל פריט קטלוג מציין על מה הוא נשען: נקרא מתוך החומר, או הוסק ממנו. הסקה היא קריאה שקולה, לא ודאות.',
          'הרשומות מתפרסמות בחמש שפות. תרגומי מכונה מסומנים ככאלה, ובמקרה של פער בין תרגום למקור, המקור הוא מה שהארכיון מחזיק.',
        ],
      },
      {
        heading: 'חשבונות',
        body: [
          'חשבון נועד לבדיקת הארכיון ומאושר על ידי מנהל. שמרו את הסיסמה לעצמכם, ועדכנו את המרכז אם נראה לכם שהיא הגיעה לאדם אחר. חשבון עלול להיות מושעה אם נעשה בו שימוש לפרסום חומר שאסור היה לפרסם.',
        ],
      },
      {
        heading: 'זמינות',
        body: [
          'הארכיון מוצע כמות שהוא. המרכז אינו מתחייב לזמינות רציפה של האתר ואינו אחראי לנזק שייגרם משימוש בו. הוא כן מתחייב להחזיק יותר מעותק אחד של מה שהופקד בידיו.',
        ],
      },
      {
        heading: 'דין',
        body: [
          'על תנאים אלה חלים דיני מדינת ישראל, ולבתי המשפט בישראל הסמכות לדון בכל מחלוקת שתתעורר בעניינם.',
        ],
      },
    ],
  },
};

export const ACCESSIBILITY: Record<'en' | 'he', LegalDocument> = {
  en: {
    title: 'Accessibility statement',
    standfirst: 'What has been done so that this archive can be used by everyone, what is not finished, and whom to tell.',
    updated: LEGAL_UPDATED,
    missingContact: 'The Center has not yet published an address for accessibility requests.',
    missingOfficer:
      'The Center has not yet named the person responsible for accessibility. This statement is incomplete until it does.',
    clauses: [
      {
        heading: 'What this site aims at',
        body: [
          'The archive is built to the WCAG 2.1 AA guidelines, which is the standard Israeli regulations point at (Israeli Standard 5568, under the Equal Rights for Persons with Disabilities Regulations, 2013).',
        ],
      },
      {
        heading: 'What was done',
        body: ['These are properties of the site, not intentions:'],
        list: [
          'Every page works from the keyboard alone, and the focus outline is a single thick ring that is never removed.',
          'A “skip to content” link is the first thing on every page.',
          'Text is set at 18px rather than the browser’s 16, scales from the reader’s own setting, and the layout holds at 200% zoom.',
          'The page is marked with its language and its direction, so a screen reader reads Hebrew in a Hebrew voice and right to left.',
          'Colour is never the only thing carrying meaning: a community is named as well as coloured, and a decision is worded as well as tinted.',
          'Images added by the archive carry alternative text, and a record’s own scan carries the record’s title.',
          'Animation is small, and none of it runs for a reader whose system asks for reduced motion.',
          'A dark and a light appearance are both available, and the site follows the system setting until told otherwise.',
        ],
      },
      {
        heading: 'What is not finished',
        body: ['Stated plainly, because a statement that claims everything is finished is not worth reading:'],
        list: [
          'Parts of the review and administration screens, which only Moderators see, still show some English wording when the site is set to another language.',
          'Recordings and video in the archive have a machine transcription where one could be made, but not captions on the player itself.',
          'Scans of handwriting are images. The machine reads what it can and that text is published beside the record, but a hand nobody could read remains a picture.',
          'PDF files contributed to the archive are published as they arrived; the Center does not remake them.',
        ],
      },
      {
        heading: 'If something is not accessible to you',
        body: [
          'Tell the Center. Say which page, what you were trying to do, and what happened. A report of this kind is treated as a fault in the site rather than as a request for a favour, and the person responsible for accessibility is required to answer it.',
        ],
      },
      {
        heading: 'This statement',
        body: [
          'It was last reviewed on the date above, against the site as it then stood. It is reviewed again whenever a screen is rebuilt.',
        ],
      },
    ],
  },

  he: {
    title: 'הצהרת נגישות',
    standfirst: 'מה נעשה כדי שאפשר יהיה להשתמש בארכיון הזה, מה עוד לא הושלם, ולמי לפנות.',
    updated: LEGAL_UPDATED,
    missingContact: 'המרכז עדיין לא פרסם כתובת לפניות בנושא נגישות.',
    missingOfficer:
      'המרכז עדיין לא מינה אחראי נגישות ולא פרסם את פרטיו. עד שזה ייעשה, ההצהרה הזאת אינה שלמה.',
    clauses: [
      {
        heading: 'לאיזו רמה האתר חותר',
        body: [
          'הארכיון נבנה לפי הנחיות WCAG 2.1 ברמה AA, התקן שאליו מפנות התקנות בישראל (תקן ישראלי 5568, מכוח תקנות שוויון זכויות לאנשים עם מוגבלות, התשע״ג-2013).',
        ],
      },
      {
        heading: 'מה נעשה',
        body: ['אלה תכונות של האתר, לא כוונות:'],
        list: [
          'כל עמוד פועל מהמקלדת בלבד, וסימון הפוקוס הוא טבעת אחת עבה שלא מוסרת בשום מצב.',
          'קישור ״דלג לתוכן״ הוא הדבר הראשון בכל עמוד.',
          'הטקסט מוגדר ב-18 פיקסל במקום 16, מתרחב לפי ההגדרה של הקורא, והפריסה מחזיקה גם בזום 200%.',
          'העמוד מסומן בשפה ובכיוון שלו, כך שקורא מסך קורא עברית בקול עברי ומימין לשמאל.',
          'צבע לעולם אינו הדבר היחיד שנושא משמעות: קהילה גם נקראת בשמה ולא רק נצבעת, והחלטה גם מנוסחת במילים.',
          'לתמונות שהארכיון מוסיף יש טקסט חלופי, ולסריקה של רשומה יש הכותרת של אותה רשומה.',
          'האנימציה מעטה, ואף אחת מהן לא רצה אצל מי שהמערכת שלו מבקשת תנועה מופחתת.',
          'קיימים מצב בהיר ומצב כהה, והאתר הולך לפי הגדרת המערכת עד שמבקשים אחרת.',
        ],
      },
      {
        heading: 'מה עוד לא הושלם',
        body: ['נאמר במפורש, כי הצהרה שטוענת שהכל מושלם אינה שווה קריאה:'],
        list: [
          'חלקים ממסכי הבדיקה והניהול, שרק מודרטורים רואים, עדיין מציגים ניסוחים באנגלית כשהאתר מוגדר לשפה אחרת.',
          'להקלטות ולווידאו בארכיון יש תמלול מכונה במקום שאפשר היה להפיק אותו, אבל אין כתוביות בנגן עצמו.',
          'סריקות של כתב יד הן תמונות. המכונה קוראת מה שניתן והטקסט מתפרסם לצד הרשומה, אבל כתב שאיש לא הצליח לפענח נשאר תמונה.',
          'קובצי PDF שנתרמו לארכיון מתפרסמים כפי שהתקבלו, והמרכז אינו בונה אותם מחדש.',
        ],
      },
      {
        heading: 'אם משהו אינו נגיש עבורכם',
        body: [
          'פנו למרכז. ציינו באיזה עמוד מדובר, מה ניסיתם לעשות ומה קרה. פנייה כזאת מטופלת כתקלה באתר ולא כבקשת טובה, והאחראי על הנגישות מחויב להשיב עליה.',
        ],
      },
      {
        heading: 'ההצהרה הזאת',
        body: [
          'נבדקה לאחרונה בתאריך שלמעלה, מול האתר כפי שהיה באותו יום. היא נבדקת מחדש בכל פעם שמסך נבנה מחדש.',
        ],
      },
    ],
  },
};
