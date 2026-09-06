/**
 * Every word the interface says, in the language it was written in.
 *
 * ── why a catalogue and not a model call ────────────────────────────────────
 *
 * The records are translated by a model at the moment they are needed, because
 * they are thousands of rows that keep arriving and nobody can pre-write them.
 * The interface is the opposite: a few hundred strings that change when someone
 * edits this file and at no other time. Translating those through a model at
 * request time would be slower, would spend the archive's daily allowance on
 * the word "Submit", and — measured on this project — would occasionally return
 * Malayalam that decays into another script mid-word with nothing in the
 * response to say so.
 *
 * So they are translated **once, by a script, into files a person can read and
 * correct** (`npm run i18n`). A wrong menu label is then a line in a JSON file
 * rather than a dice roll on every page load. That is the whole difference.
 *
 * ── on missing keys ─────────────────────────────────────────────────────────
 *
 * A key with no translation falls back to the English here. A half-finished
 * catalogue therefore shows a mixed page, never a page full of `nav.portal`.
 * That matters because the allowance is small and a language may genuinely
 * arrive in pieces.
 */

export const en = {
  // ── the shell every page carries ──────────────────────────────────────────
  'site.name': 'Indian Jewish Heritage Center',
  'site.short': 'IJHC',
  'site.home': 'Indian Jewish Heritage Center — home',
  'site.description':
    'A digital archive of the Bene Israel, Cochin, Baghdadi and Bnei Menashe communities. Four streams, one river.',
  'site.skipToContent': 'Skip to content',

  'nav.menu': 'menu',
  'nav.openMenu': 'Open the menu',
  'nav.closeMenu': 'Close the menu',
  'nav.portal': 'Portal',
  'nav.contribute': 'Contribute',
  'nav.review': 'Review',
  'nav.manage': 'Manage',
  'nav.signIn': 'Sign in',
  'nav.signOut': 'Sign out',
  'nav.createAccount': 'Create an account',

  'nav.signedInAs': 'Signed in as {email}',
  'nav.main': 'Main',
  'nav.archiveAdmin': 'Archive administration',
  'nav.archive': 'Archive',
  'nav.keywords': 'Keywords',
  'nav.families': 'Families',
  'nav.accounts': 'Accounts',
  'nav.waiting': '{count} waiting',
  'nav.pendingAccount':
    'Your account is waiting for an administrator to approve it. Until then you see the archive as any visitor does.',

  'masthead.fourStreams': 'Four Streams of History',
  'masthead.digitalArchive': 'Digital Archive · Four Streams of History',

  'footer.partner': 'with the Cochin Jewish Heritage Center · preserving two thousand years',
  'footer.label': 'Footer',
  'footer.browse': 'Browse the archive',
  'footer.contribute': 'Contribute an item',
  'footer.handling': 'How your contribution is handled',
  'footer.promise':
    'Every description in this archive was written or checked by a person. Machine suggestions are marked as such and are never published unread.',

  // ── the four streams, and what a record is ────────────────────────────────
  // The communities are proper names, but a Malayalam reader should meet them
  // in Malayalam. The catalogue is where that judgement is made once.
  'community.bene_israel': 'Bene Israel',
  'community.cochin': 'Cochin',
  'community.baghdadi': 'Baghdadi',
  'community.bnei_menashe': 'Bnei Menashe',
  'community.general_india': 'General India',

  'category.material_culture': 'Material Culture',
  'category.documents': 'Documents',
  'category.oral_histories': 'Oral Histories',
  'category.none': 'Not catalogued',

  // ── the front door ────────────────────────────────────────────────────────
  'home.title': 'Indian Jewish Heritage Center',
  'home.description':
    'Two thousand years of Bene Israel, Cochin, Baghdadi and Bnei Menashe heritage. Browse the archive, or add something your family kept.',
  'home.years': 'Years',
  'home.ofOur': 'of our',
  'home.heritage': 'Heritage',
  'home.saveItNow': 'Save it Now',
  'home.standfirst':
    'The Bene Israel, Cochin, Baghdadi and Bnei Menashe communities of India, kept together in one place. Everything here was checked by a person before it was published.',
  'home.explore': 'Explore the archive',
  'home.contribute': 'Add something you kept',
  'home.recordsPublished': '{count} records published',
  'home.recordPublished': '{count} record published',

  // ── the portal ────────────────────────────────────────────────────────────
  'portal.title': 'Heritage Portal',
  'portal.description':
    'Search verified records from the Bene Israel, Cochin, Baghdadi and Bnei Menashe communities.',
  'portal.eyebrow': 'A digital archive of Indian Jewish life',
  'portal.headline1': 'Four streams,',
  'portal.headline2': 'one river',
  'portal.standfirst':
    'Records from the Bene Israel, Cochin, Baghdadi and Bnei Menashe communities. Every description here was read and checked by a person before it was published.',
  'portal.countMatching': '{count} records matching',
  'portal.countMatchingOne': '{count} record matching',
  'portal.countPublished': '{count} records published',
  'portal.countPublishedOne': '{count} record published',
  'portal.truncated': 'Showing the first {count}. Narrow the search to see the rest.',
  'portal.emptyTitle': 'Nothing matches that yet',
  'portal.emptyBody':
    'Try a broader search, or clear the filters. If the archive is new, the first records appear here once a volunteer has reviewed them.',
  'portal.communityUnknown': 'Community not identified',

  'controls.search': 'Search the archive',
  'controls.searchPlaceholder': 'Title, description, keyword, place',
  'controls.allCategories': 'All categories',
  'controls.allCommunities': 'All streams',
  'controls.clearAll': 'Clear all',
  'controls.grid': 'Grid',
  'controls.list': 'List',
  'controls.view': 'View',

  // ── one record ────────────────────────────────────────────────────────────
  'record.notFound': 'Record not found',
  'record.backToPortal': 'Back to the portal',
  'record.readItIn': 'Read it in {language}',
  'record.provenance': 'Provenance',
  'record.contributor': 'Contributor',
  'record.capturedFrom': 'Captured from',
  'record.period': 'Period',
  'record.placeOfOrigin': 'Place of origin',
  'record.language': 'Language',
  'record.added': 'Added',
  'record.file': 'File',
  'record.dimensions': 'Dimensions',
  'record.notRecorded': 'Not recorded',
  'record.notMeasured': 'Not measured',
  'record.measuredNote':
    'Values in monospace were measured from the file itself. Everything else was written or confirmed by a person before this record was published.',

  'controls.searchTitles': 'Search titles, descriptions, provenance, keywords',
  'controls.layout': 'Layout',
  'controls.community': 'Community',
  'controls.type': 'Type',
  'controls.updating': 'Updating…',
  'controls.viewNamed': '{view} view',
  'controls.all': 'All',
  'streams.noneYet': 'none yet',
  'streams.share': '{share}% of the four streams',
  'streams.communityNotIdentified': 'Community not yet identified',

  // ── contributing ──────────────────────────────────────────────────────────
  'upload.title': 'Contribute',
  'upload.description':
    'Add a photograph, document, or recording to the Indian Jewish Heritage Center archive.',
  'upload.eyebrow': 'Open to everyone — no account needed',
  'upload.headline': 'Contribute an item',
  'upload.standfirst':
    'A photograph, a document, a recording. The archive reads what it can from the file and suggests a description — a volunteer checks all of it before anything is published.',

  'upload.step.files': 'Add your files',
  'upload.step.filesRead': 'The page the archive read',
  'upload.step.filesHint': 'Choose them, drag them in, or paste an image straight from your clipboard.',
  'upload.step.orAddress': 'Or give it an address',
  'upload.step.grouping': 'Are these one item, or several?',
  'upload.step.groupingSettled': 'Settled — the archive has read them this way. Start again to change it.',
  'upload.step.groupingOpen': 'Only you can tell.',
  'upload.step.onePages': 'Pages of one item',
  'upload.step.separate': 'Separate items',
  'upload.step.tell': 'Tell us what you know',
  'upload.step.read': 'Let the archive read it',

  'upload.field.title': 'Title',
  'upload.field.titlePlaceholder': 'Silver Torah pointer, Cochin',
  'upload.field.origin': 'Where it came from',
  'upload.field.originPlaceholder': 'The Elias family, Mumbai',
  'upload.field.yourName': 'Your name — optional',
  'upload.field.yourNamePlaceholder': 'Ruth Elias',
  'upload.field.yourEmail': 'Your email — optional',

  'upload.action.analyseItem': 'Analyse this item',
  'upload.action.analysePage': 'Analyse this page',
  'upload.action.analyseItems': 'Analyse these items',
  'upload.action.reading': 'Reading the file…',
  'upload.action.addMore': 'Add more files',
  'upload.action.choose': 'Choose files, drag them here, or paste',
  'upload.action.readPage': 'Read the page',
  'upload.action.readingPage': 'Reading…',
  'upload.action.removeLink': 'Remove this link',
  'upload.linkPlaceholder': 'https://example.org/an-article',
  'upload.leadImage': 'Lead image',
  'upload.capturedText': 'Captured text',

  'upload.done.one': 'Submitted for review',
  'upload.done.many': '{count} submissions received',
  'upload.done.keepLink': 'Keep this link',
  'upload.done.keepLinks': 'Keep these links',

  'upload.error.generic': 'Something went wrong. Try again.',
  'upload.error.consent': 'Tick the box above to confirm you may share this material.',
  'upload.error.save': 'The submission did not save. Try again.',
  'upload.error.page': 'That page could not be read.',

  // ── the language picker ───────────────────────────────────────────────────
  'language.reading': 'Reading in {language}. Choose a language.',
  'language.prompt': 'Read the archive in',

  // ── translation, as the reader meets it ───────────────────────────────────
  'translation.byMachine': 'Translated into {language} by machine',
  'translation.showOriginal': 'Show the record as it was written',
  'translation.showTranslation': 'Show the translation',
  'translation.inProgress': 'Translating into {language}…',
  'translation.unavailable': 'This record is not available in {language} yet.',
  'translation.original': 'As it was written',
} as const;

export type MessageKey = keyof typeof en;
export type Catalogue = Partial<Record<MessageKey, string>>;

/**
 * The strings, with `{placeholders}` filled in.
 *
 * Placeholders rather than string concatenation, because word order is not a
 * constant: "Reading in Hebrew" is one order in English and another in Hebrew,
 * and a sentence assembled from fragments can only ever be right in the
 * language it was assembled for.
 */
export function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}
