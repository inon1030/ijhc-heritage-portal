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
    'Try a broader search, or clear the filters. If the archive is new, the first records appear here once the knowledge expert has reviewed them.',
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
  'streams.nothingPublished': 'Nothing published yet',
  'common.simulated':
    'DEMO — SIMULATED. No AI model examined this file. Set GEMINI_API_KEY to get real analysis.',
  'streams.share': '{share}% of the four streams',
  'streams.communityNotIdentified': 'Community not yet identified',

  // ── contributing ──────────────────────────────────────────────────────────
  'upload.title': 'Contribute',
  'upload.description':
    'Add a photograph, document, or recording to the Indian Jewish Heritage Center archive.',
  'upload.eyebrow': 'Open to everyone — no account needed',
  'upload.headline': 'Contribute an item',
  'upload.standfirst':
    'A photograph, a document, a recording. The AI reads what it can from the file and suggests a description — the knowledge expert checks it, approves it and publishes it.',

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

  // ── the review workbench ──────────────────────────────────────────────────
  'review.languagesHeading': 'Every language this will be published in',
  'review.languagesNote':
    'The archive publishes each record in five languages. Read them here before you approve — what you correct is kept, and the translator will not overwrite it.',
  'review.translateMissing': 'Translate what is missing',
  'review.translating': 'Translating…',
  'review.loadingLanguages': 'Loading the languages…',
  'review.byHand': 'corrected by hand',
  'review.byMachine': 'machine',
  'review.stale': 'made from older text',
  'review.missing': 'not translated yet',
  'review.notTranslatedYet': 'Not translated yet',
  'review.saveCorrection': 'Save correction',
  'review.saving': 'Saving…',
  'review.discard': 'Discard',
  'review.quotaGone':
    'The day’s translation allowance is gone. What is missing will be made overnight.',
  'review.field.title': 'Title',
  'review.field.description': 'Description',
  'review.field.provenance': 'Provenance',
  'review.field.period': 'Period',
  'review.field.originPlace': 'Place of origin',
  'review.backToQueue': 'Back to the queue',
  'review.history': 'History',

  // ── the pre-review panel a contributor edits ──────────────────────────────
  'prereview.heading': 'What the AI found',
  'prereview.aiSuggested': 'The AI suggested:',
  'prereview.useThis': 'use this',
  'prereview.subtitle':
    'Suggestions, not a record. Correct anything you know better — the knowledge expert reviews it, approves it and publishes it.',
  'prereview.hide': 'Hide this panel',
  'prereview.titleForItem': 'Title for this item',
  'prereview.machineReading': 'The machine’s reading',
  'prereview.yourDescription': 'Your description',
  'prereview.yourTags': 'Your tags',
  'prereview.addTag': 'Search the archive’s tags',
  'prereview.tagsFromList':
    'Tags come from the archive’s own list, so the same thing is filed under the same word everywhere. If what you want is not here, say it in the description and the knowledge expert can add it.',
  'prereview.tagsSuggested': 'Suggested for this item',
  'prereview.tagsNoMatch': 'No tag matches that.',
  'prereview.tagsAll': 'Browse all tags',
  'prereview.addTagAction': 'Add tag',
  'prereview.removeTag': 'Remove {term}',
  'prereview.tickTheBox':
    'Tick the box under “Tell us what you know” to confirm you may share this material.',
  'prereview.fileOf': 'File {n} of {total}',
  'prereview.submit': 'Submit for review',
  'prereview.submitMany': 'Submit {count} items',
  'prereview.submitting': 'Submitting…',
  'prereview.show': 'Show what the archive found',
  'prereview.size': 'Size',
  'prereview.dimensions': 'Dimensions',
  'prereview.type': 'Type',
  'prereview.duration': 'Duration',
  'prereview.textFound': 'Text found in the item',
  'prereview.transcript': 'Transcript',

  // The language switch under the scanned text, at pre-review. A contributor
  // who reads only Marathi is being asked whether the machine read their
  // document correctly, so they have to be able to read the reading.
  'reading.readIn': 'Read this in',
  'reading.original': 'Original',
  'reading.translating': 'Translating…',
  'reading.machine':
    'Machine translation of the text above, made for you to check it. The original is one click away, and it is the original that is submitted.',
  'reading.failed': 'That translation could not be made. The text above is unchanged.',

  // ── files ─────────────────────────────────────────────────────────────────
  'file.none': 'No file attached',
  'file.capturedPage': 'Captured page text',
  'file.pdf': 'PDF document',
  'file.open': 'Open file',
  'file.close': 'Close',
  'file.noPreview': 'This file type cannot be previewed in the browser.',
  'file.previous': 'Previous file',
  'file.next': 'Next file',

  // ── signing in ────────────────────────────────────────────────────────────
  'login.yourName': 'Your name',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.passwordHint': 'At least ten characters.',
  'login.signingIn': 'Signing in…',
  'login.sending': 'Sending…',
  'login.sendRequest': 'Send the request',
  'login.noAccountNeeded': 'Browsing and contributing need no account. Reviewing does.',
  'login.approvalNote':
    'An administrator approves each request. Until then the account can sign in and see only what any visitor sees.',
  'login.badCredentials': 'That email and password do not match an account.',
  'login.requestFailed': 'The request did not go through. Try again shortly.',
  'login.awaitingApproval': 'Your account is waiting for approval',
  'login.awaitingBody':
    '{email} is registered, and an administrator has to approve it before the review queue opens. Nothing else is needed from you.',
  'login.browseMeanwhile': 'Browse the archive in the meantime',

  // ── the receipt a contributor keeps ───────────────────────────────────────
  'receipt.title': 'Your contribution',
  'receipt.badLink': 'That link is not right',
  'receipt.contributeSomething': 'Contribute something',
  'receipt.gone': 'This contribution is no longer held',
  'receipt.withdrawn': 'Withdrawn',
  'receipt.withdrawnBody':
    'This contribution has been taken out of the archive. If you did not ask for that and it looks wrong, get in touch.',
  'receipt.published': 'Published',
  'receipt.keptNotPublic': 'Kept, but not public',
  'receipt.notAdded': 'Not added to the archive',
  'receipt.waiting': 'Waiting for the knowledge expert',
  'receipt.badLinkBody': 'This address does not match a contribution. Check the link you were given, or contribute something new.',
  'receipt.goneBody': 'The record this receipt pointed at is no longer held in the archive.',
  'receipt.publishedBody': 'The knowledge expert checked it and it is in the public archive.',
  'receipt.keptNotPublicBody':
    'The knowledge expert catalogued it and marked it as not for public display. It is held in the archive and available to researchers on request.',
  'receipt.notAddedBody':
    'The knowledge expert looked at it and decided it falls outside what this archive collects. That is about the archive, not about the material — it is still yours.',
  'receipt.waitingBody':
    'It has arrived safely. The knowledge expert checks each contribution against the original before anything is published, so this can take a while.',

  // ── the review queue ──────────────────────────────────────────────────────
  'queue.title': 'Review queue',
  'queue.volunteersOnly': 'Knowledge experts only',
  'queue.clear': 'The queue is clear',
  'queue.openPortal': 'Open the portal',

  // ── when something breaks ─────────────────────────────────────────────────
  'error.label': 'Error',
  'error.unreachable': 'The archive could not be reached',
  'error.tryAgain': 'Try again',

  // ── the archive's own tools ───────────────────────────────────────────────
  'manage.heading': 'Archive administration',
  'manage.title': 'Manage',
  'manage.administratorsOnly': 'Administrators only',
  'manage.volunteerAccess': 'Knowledge expert access',

  'vocab.newTerm': 'New term',
  'vocab.subdivides': 'Subdivides',
  'vocab.offeredFor': 'Offered for',
  'vocab.allCommunities': 'All communities',
  'vocab.add': 'Add',
  'vocab.remove': 'Remove',
  'vocab.variants': 'Variants',

  'families.heading': 'Family name',
  'families.community': 'Community',
  'families.note': 'Family names are attached to a record by a knowledge expert, never guessed.',
  'families.add': 'Add a family',
  'families.notes': 'Notes',

  'accounts.nobodyWaiting': 'Nobody is waiting. Requests arrive from the sign-in page.',
  'accounts.asAdministrator': 'As administrator',
  'accounts.approve': 'Approve',
  'accounts.decline': 'Decline',

  'bin.empty': 'The bin is empty',
  'bin.destroy': 'Destroy',
  'bin.cancel': 'Cancel',
  'bin.restore': 'Restore',

  'fields.heading': 'What the archive found',
  'fields.add': 'Add a field',
  'fields.choose': 'Choose a field…',
  'ledger.heading': 'What this rests on',
  'ledger.each': 'What each answer rests on',

  'notfound.title': 'That record is not here',
  'notfound.body':
    'It may still be awaiting review, or it may have been taken out of the archive.',

  'upload.contributeAnother': 'Contribute another',
  'common.backToPortal': 'Back to the portal',
  'receipt.seeInArchive': 'See it in the archive',
  'file.accepted': 'Images, PDFs, audio and video. Up to {size} each.',
  'file.viewableCopy': 'A viewable copy appears once the archive reads it',
  'file.cannotPlay': 'Your browser cannot play this recording.',
  'consent.agree': 'I may share this material, and I agree to',
  // The link that opens the terms. It was the one piece of the sentence still
  // set in English, so a Hebrew reader met "ואני מסכים ל how it will be
  // handled" — the words naming what they are agreeing to, in a language they
  // may not read, inside the one sentence where that matters most.
  'consent.howHandled': 'how it will be handled',
  'consent.openTerms': 'Open the full terms in their own page',
  'handling.title': 'How your contribution is handled',
  'handling.description':
    'What happens to material sent to the Indian Jewish Heritage Center archive, what is published, and what is done with an email address.',
  'login.requestIn': 'Your request is in',
  'login.signIn': 'Sign in',

  // ── the review workbench, field by field ──────────────────────────────────
  'wb.original': 'The original',
  'wb.capturedFrom': 'Captured from',
  'wb.measured': 'Measured from the file itself. Nothing above was generated.',
  'wb.textRead': 'Text the model read',
  'wb.transcript': 'Transcript',
  'wb.theRecord': 'The record',
  'wb.contributorSaid': 'What the contributor said',
  'wb.theyCorrected': 'They corrected the archive on',
  'wb.useThis': 'Use this',
  'wb.knownFamily': 'Known family:',
  'wb.mayNotBelong': 'This may not belong to the archive',
  'wb.noAnalysis': 'Analysis did not run for this item. Fill the fields in yourself.',
  'wb.notCatalogued': 'Not catalogued',
  'wb.notIdentified': 'Not identified',
  'wb.publish': 'Publish',
  'wb.shadowGallery': 'Hold in Shadow Gallery',
  'wb.reject': 'Reject',
  'wb.returnToQueue': 'Return to the queue',
  'wb.whoFor': 'Who this is for',
  'wb.keywords': 'Keywords',
  'wb.noneYet': 'None yet',
  'wb.manage': 'Manage',
  'wb.nothingMatches': 'Nothing matches that.',
  'wb.families': 'Families',
  'wb.chooseCommunityFirst': 'Choose a community first — families belong to one.',
  'wb.fileName': 'File name',
  'wb.type': 'Type',
  'wb.size': 'Size',
  'wb.dimensions': 'Dimensions',
  'wb.title': 'Title',
  'wb.description': 'Description',
  'wb.descriptionHint': 'What a visitor should read on the record page.',
  'wb.kind': 'Kind of item',
  'wb.community': 'Community',
  'wb.provenance': 'Provenance',
  'wb.provenanceHint': 'Who owned it, where it was kept, how it reached the archive',
  'wb.language': 'Language',
  'wb.languageHint': 'Marathi, Malayalam, Judeo-Arabic, Hebrew, English',
  'wb.period': 'Period',
  'wb.placeOfOrigin': 'Place of origin',
  'wb.placeHint': 'Calcutta, India',
  'wb.filterVocabulary': 'Filter the vocabulary',

  'manage.vocabulary': 'Vocabulary',
  'manage.families': 'Families',
  'manage.accounts': 'Accounts',
  'manage.bin': 'Bin',

  'vocab.everyCommunity': 'Every community',
  'vocab.empty': 'The vocabulary is empty. Until it has terms, records can carry no keywords at all.',
  'vocab.mergeInstead': 'If it is a duplicate, merge it instead.',
  'vocab.make': 'Make',
  'vocab.spellingOf': 'Which term is it a spelling of?',
  'vocab.suggested': 'Suggested by the model',
  'vocab.nothingWaiting': 'Nothing waiting.',
  'vocab.saving': 'Saving',
  'vocab.chooseBranch': 'Choose a branch',
  'vocab.placeUnder': 'Place it under…',
  'vocab.makeSpelling': 'Make this a spelling of another term',
  'vocab.addToVocabulary': 'Add to the vocabulary',
  'vocab.notATerm': 'Not a term for this archive',

  'families.namesAre': 'Family names are',
  'families.noteOptional': 'Note — optional',
  'families.noAddresses': 'No addresses linked to this family yet.',
  'families.theirName': 'Their name, if known',
  'families.contributors': 'Contributors',
  'families.nobodyLeftAddress': 'Nobody has left an address yet.',
  'families.searchContributors': 'Search contributors',
  'families.erase': 'Erase',
  'families.onlyRegisterGoes': 'They have sent nothing, so only the register entry goes.',
  'families.nameOptional': 'Name — optional',
  'families.findAddress': 'Find an address or a name',

  'accounts.deleteForGood': 'Delete for good',
  'accounts.keep': 'Keep',
  'accounts.volunteer': 'Knowledge expert',
  'accounts.administrator': 'Administrator',
  'accounts.suspend': 'Suspend',
  'accounts.onlyAdmin': 'The only administrator — promote someone else first',

  'common.remove': 'Remove',
  'common.notDetermined': 'Not determined',
  'common.editedByContributor': 'Edited by the contributor',
  'families.examplePlaceholder': 'Merchant family, Bombay and Shanghai',
  'prereview.vocabularyNote':
    'The knowledge expert matches these to the archive’s own vocabulary before publishing.',
  'prereview.prefilled':
    'Pre-filled with the machine’s reading. Change anything you know better.',
  'common.cancel': 'Cancel',
  'common.saving': 'Saving',
  'notfound.withdrawn':
    'It may still be awaiting review, or it may have been withdrawn from the public archive.',
  'login.requestInBody': 'An administrator has to approve',
  'login.askForAccount': 'Ask for an account',

  // ── the terms a contributor agrees to ─────────────────────────
  // Translated like everything else, and marked as a translation wherever it
  // is shown. The English stays the version of record, because the English is
  // what `consentVersion` on every submission points at — but a contributor
  // who cannot read the terms they are agreeing to is the worse failure of
  // the two. So: translated, and told plainly which one binds.
  'consent.machineNotice':
    'This page is a machine translation. The English version is the one you are agreeing to.',
  'consent.readEnglish': 'Read the terms in English',
  'handling.standfirst':
    'Plain terms, and the ones actually shown to you before you send anything. Every clause describes something the archive does rather than something it reserves the right to do.',
  'handling.versionNote':
    'The version above is recorded on every record at the moment it is submitted, so a contribution is always tied to the wording that was actually on the screen. Earlier versions are never rewritten.',

  'consent.c1.heading': 'What happens to what you send',
  'consent.c1.p1':
    'A knowledge expert reads it and checks it against the file before anything appears in public. Until then it is visible only to knowledge experts of the Heritage Center.',
  'consent.c1.p2':
    'If it is accepted, the material and the description are published on this site under the Center’s name, and anyone can see them. If it is not accepted, it normally stays in the archive as an unpublished record rather than being deleted, so that a decision can be revisited — but see what the Center may do without asking you, below.',

  'consent.c2.heading': 'The machine reading',
  'consent.c2.p1':
    'An automated system reads the file and suggests a description, a period, a place, and keywords. Everything it produces is a suggestion. A person decides what becomes the record.',
  'consent.c2.p2':
    'To do that, the file is sent to Google’s Gemini service, outside the Center.',
  'consent.c2.p3':
    'The archive currently uses that service on its free tier. Under Google’s terms for unpaid use, material sent there may be reviewed by people at Google and used to improve their products. A paid account carries the opposite undertaking.',
  'consent.c2.p4':
    'So: if the material is private, or shows a living person, or you would rather it were not seen outside the Center, do not upload it here. Contact the Center and it will be taken in by hand.',

  // The same clause on a paid account. Its own keys, because the notice is
  // translated by position and the two tiers must never share one.
  'consent.c2paid.heading': 'The machine reading',
  'consent.c2paid.p1':
    'An automated system reads the file and suggests a description, a period, a place, and keywords. Everything it produces is a suggestion. A person decides what becomes the record.',
  'consent.c2paid.p2': 'To do that, the file is sent to Google’s Gemini service, outside the Center.',
  'consent.c2paid.p3':
    'The archive uses that service on a paid account. Under Google’s terms for paid use, what is sent is not reviewed by people at Google and is not used to improve their products.',
  'consent.c2paid.p4':
    'It still leaves the Center to be read by a machine, so if the material is one you would rather nobody outside the Center held even briefly, contact the Center and it will be taken in by hand.',

  'consent.c3.heading': 'Your name and email address, if you give them',
  'consent.c3.p1':
    'Both are optional. Leaving them blank does not change how your contribution is treated.',
  'consent.c3.p2':
    'Neither is published as part of a record. The address is not an account and grants no access to anything — but anyone who knows it can type it into the portal and see the records you sent that are already public. It reveals nothing that is not already on the site; it groups what is. Material still in review, or not accepted, is never shown this way.',
  'consent.c3.p3':
    'The knowledge experts who catalogue the archive can see both. That is how somebody comes back to you with a question, how several contributions from you are kept together, and how a knowledge expert records that an address belongs to a particular family — which is often what allows old material to be placed at all.',
  'consent.c3.p4':
    'A family name recorded against your address is not published by that alone. Family names appear on a record only when a knowledge expert decides the family belongs on it.',
  'consent.c3.p5':
    'Neither is used for a newsletter, passed to anyone outside the Center, or sold.',

  'consent.c4.heading': 'Names of people',
  'consent.c4.p1':
    'Family names attached to a record are published with it — that is what makes a heritage archive usable, and it means the surnames of living relatives can appear in public.',
  'consent.c4.p2':
    'Do not send material that names or shows a living person without their agreement. If you are unsure, say so in the description; a knowledge expert will hold it rather than publish it.',

  'consent.c5.heading': 'Rights in the material',
  'consent.c5.p1':
    'Sending something here does not transfer its ownership. You are confirming that it is yours to share, or that you have permission from whoever it belongs to.',
  'consent.c5.p2':
    'You are giving the Heritage Center permission to keep it, describe it, and publish it as part of the archive.',

  'consent.c6.heading': 'Following what you sent',
  'consent.c6.p1':
    'At the end of an upload you are given a link, one for each contribution. It shows you whether a knowledge expert has published it yet, and it does not expire.',
  'consent.c6.p2':
    'It needs no account and no password, so keep it somewhere you will find it — the Center cannot send you another unless it has your address.',
  'consent.c6.p3':
    'Anyone holding that link can see the same page, so treat it the way you would treat the material itself.',

  'consent.c7.heading': 'What the Center may do without asking you',
  'consent.c7.p1':
    'The Heritage Center decides what the archive holds. It may decline your contribution, take a published record out of public view, or remove material entirely, at its own discretion and without telling you first.',
  'consent.c7.p2':
    'It does not need a reason it has to give you, and it does not undertake to notify you when it does. Knowledge experts are cataloguing donated material against limited time, and a duty to write to every contributor before every decision would mean the decisions do not get made.',
  'consent.c7.p3':
    'What is kept is a note that the item existed, so the same thing is not accepted again later by mistake.',
  'consent.c7.p4':
    'This does not affect the two requests below. Those are yours to make, and the Center answers them.',

  'consent.c8.heading': 'Changing your mind',
  'consent.c8.p1':
    'You can ask for material to be taken down, or ask what is held about you, at any time.',
  'consent.c8.p2':
    'You can also ask to be forgotten without withdrawing what you sent. Your name and address are erased and the material stays in the archive, no longer linked to a person. The two are separate requests and you can make either one.',

  // ── finding what one person sent (volunteers only) ────────────────────────
  'contributor.search': 'Find what someone contributed',
  'contributor.placeholder': 'their email address',
  'contributor.find': 'Find',
  'contributor.publicOnly':
    'Shows only records that are already published. Anything still being reviewed stays private.',
  'contributor.asVolunteer':
    'You are signed in, so this also shows what is still in review, held back, or declined.',
  'contributor.none': 'Nothing has been sent from that address.',
  'contributor.found': 'Everything sent from {email}',
  'contributor.clear': 'Back to the archive',

  // ── the three screens a contributor moves through ─────────────────────────
  'flow.step': 'Step {n} of 3',
  'flow.next': 'Next',
  'flow.back': 'Back',
  'flow.s1.title': 'Add what you have',
  'flow.s1.hint': 'A photograph, a document, a recording — or a link to a page.',
  'flow.s2.title': 'Tell us what you know',
  'flow.s2.hint': 'The AI reads the file. What you know about it is what it trusts.',
  'flow.s3.title': 'Check what the AI made',
  'flow.s3.hint': 'Correct anything before it goes to the knowledge expert.',

  'flow.email': 'Your email address',
  'flow.emailWhy': 'Never published. It is how we come back to you with a question.',
  'flow.emailInvalid': 'That does not look like an email address.',
  'flow.emailMissing': 'An email address is needed before the AI reads the file.',

  'flow.whatYouKnow': 'What do you know about it?',
  'flow.whatYouKnowHint':
    'Any language. The AI treats this as fact and builds its reading around it.',
  'flow.whatYouKnowPlaceholder':
    'My grandmother in Bombay, about 1940. The synagogue behind her is Magen David.',

  'flow.language': 'Language for the AI’s reading',
  'flow.languageHint': '',

  'flow.dontKnow': 'I don’t know',
  'flow.analyse': 'Read it with AI',
  'flow.analysing': 'Reading it now…',
  'flow.stillReading':
    'Still reading. A detailed scan can take half a minute — the page has not stopped.',
  'flow.needFile': 'Add a file or a link first.',
  'flow.needConsent': 'Tick the box to confirm you may share this material.',

  // ── the filter bar ────────────────────────────────────────────────────────
  'filters.all': 'All',
  'filters.stream': 'Stream',
  'filters.type': 'Type',
  'filters.text': 'Title or place',
  'filters.contributor': 'Contributor email',
  'filters.clear': 'Clear filters',
  'filters.showing': 'Showing {shown} of {total}',
  'filters.more': 'More filters',
  'filters.fewer': 'Fewer filters',

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

  // ── what a value rests on ─────────────────────────────────────────────────
  'basis.read': 'Read from the material',
  'basis.inferred': 'Inferred from style',
  'basis.guess': 'Guess',

  // ── the field sheet's own prose ───────────────────────────────────────────
  'fields.someContributor':
    'Only what it could read with reasonable certainty. Correct anything you know better — you are holding the original and it is not — and add whatever it missed.',
  'fields.noneContributor':
    'It could not read anything about this item with enough certainty to suggest it. Add whatever you know, or leave it and a knowledge expert will.',
  'fields.someVolunteer':
    'Suggestions that cleared the archive’s threshold, plus anything added by hand. Everything the model was less sure of was discarded and is not shown.',
  'fields.noneVolunteer':
    'Nothing the model proposed cleared the threshold. Add the fields this record should carry.',
  'fields.addContributor': 'Anything you know that is not above. Nothing here is required.',
  'fields.addVolunteer': 'Any branch of the tree the model did not fill.',
  'fields.undoChange': 'Undo your change to {field}',
  'fields.removeField': 'Remove the {field} field',
  'fields.putBack': 'Put back what the archive read: {value}',
  'fields.corrected': 'You changed this',

  // ── things that go wrong, said to the person they went wrong for ──────────
  'error.didNotGoThrough': 'That did not go through. Try again.',
  'error.decisionNotSaved': 'The decision did not save. Try again.',
  'error.notDeleted': 'The record was not deleted. Try again.',
  'error.languagesUnavailable': 'Could not load the languages.',
  'error.translatorUnreachable': 'The translator could not be reached.',
  'error.didNotSave': 'That did not save.',

  'bin.emptyBody':
    'Records a knowledge expert removes land here rather than disappearing. Nothing has been removed yet.',
  'bin.goToQueue': 'Go to the review queue',
  'bin.oneInBin':
    'One record is in the bin. It is off the portal and out of the review queue, and it is still here in full — restoring it puts back the decision it already carried.',
  'bin.manyInBin':
    '{count} records are in the bin. They are off the portal and out of the review queue, and they are still here in full — restoring one puts back the decision it already carried.',

  'vocab.oneTermNoHome': 'One term has no home',
  'vocab.termsNoHome': '{count} terms have no home',
  'vocab.noHomeBody':
    'These predate the tree. Until a term says which branch it subdivides, nothing can reason about it — and the model is never offered it as a proposal target.',
  'upload.done.linkExplain':
    'It shows you whether a knowledge expert has published it yet. Save it somewhere; we have no other way to reach you.',
  'upload.done.linksExplainMany':
    'They show you whether a knowledge expert has published each contribution yet. Save them somewhere; we have no other way to reach you.',
  'vocab.noBranch': 'No branch — from before the tree',
  'accounts.noName': 'No name given',
  'wb.periodPlaceholder': '1890s, late 19th century, before 1948',
  'wb.noFamiliesYet': 'No families registered for {community} yet.',
  'flow.together': 'Front and back, or the pages of one letter.',
  'flow.separate': 'Different photographs, each its own record.',
  'receipt.copyWholeAddress':
    'Contribution links are long and are easily broken by an email client or a chat app. Copy the whole address, including everything after the question mark.',
  'receipt.noRecordUnderLink':
    'The archive no longer has a record under this link. If that is unexpected, get in touch and quote the reference below.',

  // ── what the server says when it refuses ──────────────────────────────────
  //
  // Every one of these is reachable by an ordinary contributor, which is the
  // whole reason they are here: a person who set the archive to Marathi and is
  // then told in English that their file is too large has been refused twice.
  //
  // The guards a contributor cannot reach — "Sign in as an approved volunteer",
  // "This endpoint is for the scheduler" — are deliberately not in the
  // catalogue. They are read by people who administer the archive, and one of
  // them is read by nobody at all.
  'err.tooManyReadings': 'Too many readings. Try again in {seconds} seconds.',
  'err.tooManyUploads': 'Too many uploads. Try again in {seconds} seconds.',
  'err.tooManySubmissions': 'Too many submissions. Try again in {seconds} seconds.',
  'err.tooManyLinks': 'Too many links. Try again in {seconds} seconds.',
  'err.tooManyTranslations': 'Too many translations at once. Try again in {seconds} seconds.',

  'err.uploadNotOurs': 'That upload was not created here, or it has expired. Try uploading it again.',
  'err.oneUploadNotOurs':
    'One of those uploads was not created here, or it has expired. Try uploading it again.',
  'err.uploadNotFound': 'That upload could not be found. Try uploading again.',
  'err.uploadNotPrepared': 'Could not prepare the upload. Try again.',
  'err.uploadNotStarted': 'Could not start the upload. Try again.',

  'err.unsupportedType':
    '{type} is not accepted. Upload an image, PDF, audio, or video file \u2014 or paste a link and let the archive read the page.',
  'err.tooLarge': 'Files are limited to {size}.',
  'err.fileEmpty': 'That file appears to be empty.',
  'file.unidentified':
    'your browser could not identify this file type. An iPhone HEIC photo often does this; convert it to JPEG.',

  'err.fileNotFound': 'File not found.',
  'err.fileNotPublic': 'This file is not publicly available.',
  'err.fileNotOpened': 'Could not open that file.',

  'err.pageNotStored': 'The page was read but could not be stored. Try again.',

  'err.unknownLanguage': 'This archive does not publish in that language.',
  'err.readingTooLong':
    'This reading is too long to translate in one go. A knowledge expert can translate the record after it is accepted.',
  'err.translationFailed': 'That translation could not be made. The original is unchanged.',
  'err.translatorAllowance':
    'The translator has reached its daily allowance. The reading itself is unaffected \u2014 you can submit as you are.',

  // The two a contributor is most likely to meet, and the reason they are not
  // failures: the file is already stored either way, so what is lost is the
  // machine's help and not the contribution.
  'err.allowanceSpent':
    'The archive has used its reading allowance for today. Your file is safely uploaded \u2014 describe it yourself below, or come back tomorrow and it will be read then.',
  'err.noResponse':
    'The analysis service did not respond. You can still submit and describe the item yourself.',

  // ── The logical tree, as a reader sees it ─────────────────────────────────
  //
  // Generated from src/lib/fields/registry.ts by scripts/tmp/emit-field-keys.ts
  // and then owned here. The registry keeps the English as the *stored* value
  // — `item_fields.value` is a facet's own name and queries match on it — and
  // these are what is drawn on a screen. A test pins the two together.

  'group.record.label': 'Record basics',
  'group.record.blurb': 'What the portal files and colours the record by.',
  'group.item_detail.label': 'The item itself',
  'group.item_detail.blurb': 'What an archivist writes down looking at it.',
  'group.lifestyle.label': 'Lifestyle and Customs',
  'group.lifestyle.blurb': 'Content Domains',
  'group.religious_art.label': 'Religious and Art',
  'group.religious_art.blurb': 'Content Domains',
  'group.culture.label': 'Culture',
  'group.culture.blurb': 'Content Domains',
  'group.circle_of_life.label': 'Circle of Life',
  'group.circle_of_life.blurb': 'Content Domains',
  'group.digital_media.label': 'Digital Media',
  'group.digital_media.blurb': 'Content Media Types',
  'group.physical_printed.label': 'Physical and Printed',
  'group.physical_printed.blurb': 'Content Media Types',
  'group.geography.label': 'Geography',
  'group.geography.blurb': 'Communities Mapping',
  'group.social_infrastructure.label': 'Social Infrastructure',
  'group.social_infrastructure.blurb': 'Communities Mapping',
  'group.history_data.label': 'History and Data',
  'group.history_data.blurb': 'Communities Mapping',

  'fields.filedUnder': 'Filed under {path}.',

  'field.category.label': 'Kind of item',
  'field.category.hint': 'The three kinds the portal filters by. The media-type branches below are finer.',
  'field.community.label': 'Community',
  'field.community.hint': 'One of the four streams. Anything that cannot be placed in one is proposed as General India, the fifth.',
  'field.period.label': 'Period',
  'field.period.hint': 'A range. A single year only if the item states one.',
  'field.origin_place.label': 'Place of origin',
  'field.origin_place.hint': 'Town and country. "Calcutta, India".',
  'field.language.label': 'Language',
  'field.language.hint': 'The language of the material, not of this website.',
  'field.provenance.label': 'Provenance',
  'field.provenance.hint': 'Who owned it, and how it reached the archive.',
  'field.date_on_item.label': 'Date written on the item',
  'field.date_on_item.hint': 'Transcribed as it appears, in its own calendar. Not converted.',
  'field.inscription.label': 'Inscription',
  'field.inscription.hint': 'Text carried by the object itself, in its original script.',
  'field.maker.label': 'Maker or photographer',
  'field.maker.hint': 'A studio stamp, a silversmith’s mark, a printer’s name.',
  'field.material.label': 'Material',
  'field.material.hint': 'What it is made of, as far as the image shows.',
  'field.condition.label': 'Condition',
  'field.condition.hint': 'Visible damage only. Nothing about what caused it.',
  'field.domain.lifestyle.traditions.label': 'Traditions',
  'field.domain.lifestyle.day_to_day.label': 'Day-to-day life',
  'field.domain.lifestyle.food.label': 'Food',
  'field.domain.lifestyle.professions.label': 'Professions',
  'field.domain.religious.temples.label': 'Temples',
  'field.domain.religious.artifacts.label': 'Artifacts',
  'field.domain.religious.judaica.label': 'Judaica items',
  'field.domain.religious.art.label': 'Art',
  'field.domain.culture.literature.label': 'Literature and Poetry',
  'field.domain.culture.music_dance.label': 'Music and dance',
  'field.domain.culture.dress.label': 'Dress code',
  'field.domain.culture.homes.label': 'Homes and neighborhoods',
  'field.domain.life.birth_objects.label': 'Birth — objects',
  'field.domain.life.birth_stories.label': 'Birth — stories',
  'field.domain.life.birth_games.label': 'Birth — games',
  'field.domain.life.childhood.label': 'Childhood',
  'field.domain.life.maturity.label': 'Maturity',
  'field.domain.life.marriage.label': 'Marriage',
  'field.media.digital.images.label': 'Images',
  'field.media.digital.video.label': 'Video',
  'field.media.digital.sound.label': 'Sound',
  'field.media.digital.three_d.label': '3D',
  'field.media.printed.manuscripts.label': 'Documents and manuscripts',
  'field.media.printed.books.label': 'Printed books',
  'field.media.printed.newspapers.label': 'Newspaper articles',
  'field.media.printed.clothing.label': 'Clothing',
  'field.media.printed.jewelry.label': 'Jewelry',
  'field.media.printed.furniture.label': 'Furniture',
  'field.map.geo.district_state.label': 'District and State',
  'field.map.geo.district_state.hint': 'The Indian state or district, when the item names one.',
  'field.map.geo.cities_villages.label': 'Cities and Villages',
  'field.map.geo.cities_villages.hint': 'The settlement, as the item spells it.',
  'field.map.geo.markets.label': 'Markets',
  'field.map.geo.markets.hint': 'A named market or bazaar.',
  'field.map.social.education.label': 'Educational institutions',
  'field.map.social.education.hint': 'A named school, seminary, or college.',
  'field.map.social.doctors.label': 'Doctors',
  'field.map.social.doctors.hint': 'A named physician.',
  'field.map.social.birth_nurses.label': 'Birth nurses',
  'field.map.social.birth_nurses.hint': 'A named midwife or birth attendant.',
  'field.map.social.healers.label': 'Healers',
  'field.map.social.healers.hint': 'A named traditional healer, and the practice if it is stated.',
  'field.map.social.medications.label': 'Medications',
  'field.map.social.medications.hint': 'A named remedy or preparation.',
  'field.map.social.transportation.label': 'Transportation',
  'field.map.social.transportation.hint': 'The means of travel the item documents.',
  'field.map.history.events.label': 'Important events',
  'field.map.history.events.hint': 'A named event the item records or belongs to.',
  'field.map.history.key_people.label': 'Key people',
  'field.map.history.key_people.hint': 'People the item names. Only names it carries — a face is not a name.',
  'field.map.history.transformations.label': 'Social transformations',
  'field.map.history.transformations.hint': 'A shift the item documents: migration, a change of trade, a change in observance.',
  'field.map.history.statistics.label': 'Statistics',
  'field.map.history.statistics.hint': 'Figures the item states — a census count, a membership roll, a subscription list.',
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
