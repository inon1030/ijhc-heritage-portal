import {
  CATEGORY_LABELS,
  COMMUNITY_LABELS,
  type EvidenceBasis,
  type ItemCategory,
  type Community,
} from '@/lib/types';

/**
 * The logical tree — EHIC_Archive_Project_Hierarchy.xlsx, as the archive holds it.
 *
 * ─── What was taken from the document, and what was left ─────────────────────
 *
 * The spreadsheet maps the whole project across six domains. Three of them
 * describe what the archive *holds* and are catalogued here:
 *
 *   Content Domains       what the item is about       → facets
 *   Content Media Types   what the item physically is  → facets
 *   Communities Mapping   what the item names          → values
 *
 * Three describe the organisation running it and are deliberately absent:
 *
 *   Goals and Objectives  "Preserve heritage", "Human-in-the-loop verification"
 *   Stakeholders          "Researchers", "Tourists and influencers"
 *   Project Organization  "Finance", "Advisory Board", "Cloud storage"
 *
 * Those are true of the project and cannot be true of a photograph. Asking the
 * model to fill them would produce an answer every time — models do not decline
 * — and a volunteer would be handed "Marketing and PR: 0.82" on a ketubah.
 * They belong in the roadmap, not in a record. If Erez wants them catalogued,
 * moving one is adding an entry to the array below.
 *
 * ─── Facets and values ───────────────────────────────────────────────────────
 *
 * The document calls itself a היררכיה רב-שיוכית — a multi-affiliation
 * hierarchy — and that is the load-bearing word. A record is not assigned to
 * one branch. A photograph of a Cochin wedding is Marriage *and* Dress code
 * *and* Images *and* names a city, all at once. So two kinds of node:
 *
 *   facet   the record is filed under this branch. Its value is the branch's
 *           own name, and the question is whether it belongs there at all.
 *   value   the branch holds a datum the item states. "Cities and Villages" is
 *           not something a record *is*; it is a question, and "Alibag" is the
 *           answer.
 *
 * ─── Six that are not from the document ──────────────────────────────────────
 *
 * `category`, `community`, `period`, `origin_place`, `language` and
 * `provenance` are columns on `items` and predate the tree. The portal filters,
 * sorts and colours on them, so they cannot become rows. They are in the array
 * so that one gate and one prompt cover everything; `column` marks them.
 *
 * ─── Five that the tree has no place for ─────────────────────────────────────
 *
 * The `item_detail` group is mine, not Erez's: a date written on an object, an
 * inscription, a maker's mark, the material, the condition. The tree classifies
 * items and does not describe them, and those five are what an archivist writes
 * down first. Deleting the group is deleting one block below and nothing else.
 */

/** How the value is edited, and how it is validated on the way in. */
export type FieldType = 'text' | 'enum' | 'terms' | 'facet';

/** Which `items` column a field writes to. Absent means it is an item_fields row. */
export type FieldColumn =
  | 'category'
  | 'community'
  | 'language'
  | 'period'
  | 'origin_place'
  | 'provenance';

export type FieldGroupKey =
  | 'record'
  | 'item_detail'
  | 'lifestyle'
  | 'religious_art'
  | 'culture'
  | 'circle_of_life'
  | 'digital_media'
  | 'physical_printed'
  | 'geography'
  | 'social_infrastructure'
  | 'history_data';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  group: FieldGroupKey;
  type: FieldType;
  /** Where this sits in Erez's document. Empty for the eleven that are not in it. */
  path: string;
  /** Shown to the reviewer under the input. */
  hint: string;
  /** What the model is told to look for. One line of a prompt. */
  lookFor: string;
  options?: readonly FieldOption[];
  column?: FieldColumn;
  /**
   * A fact about the file rather than something to be read out of it, so the
   * model is never asked. Whether a file is a photograph is settled by its
   * first bytes; asking a vision model produced "Images, inferred, 0.98",
   * which is a confident opinion about something already known for certain —
   * and project rule 2 says technical metadata is measured, never generated.
   */
  fromFile?: true;
  maxLength: number;
}

export const FIELD_GROUPS: Record<FieldGroupKey, { label: string; blurb: string }> = {
  record: { label: 'Record basics', blurb: 'What the portal files and colours the record by.' },
  item_detail: { label: 'The item itself', blurb: 'What an archivist writes down looking at it.' },
  lifestyle: { label: 'Lifestyle and Customs', blurb: 'Content Domains' },
  religious_art: { label: 'Religious and Art', blurb: 'Content Domains' },
  culture: { label: 'Culture', blurb: 'Content Domains' },
  circle_of_life: { label: 'Circle of Life', blurb: 'Content Domains' },
  digital_media: { label: 'Digital Media', blurb: 'Content Media Types' },
  physical_printed: { label: 'Physical and Printed', blurb: 'Content Media Types' },
  geography: { label: 'Geography', blurb: 'Communities Mapping' },
  social_infrastructure: { label: 'Social Infrastructure', blurb: 'Communities Mapping' },
  history_data: { label: 'History and Data', blurb: 'Communities Mapping' },
};

export const GROUP_ORDER: FieldGroupKey[] = [
  'record',
  'item_detail',
  'lifestyle',
  'religious_art',
  'culture',
  'circle_of_life',
  'digital_media',
  'physical_printed',
  'geography',
  'social_infrastructure',
  'history_data',
];

function enumOptions<T extends string>(labels: Record<T, string>): FieldOption[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

/**
 * A branch a record is filed under.
 *
 * The value is the branch's own name, so `item_fields.value` reads as English
 * in a query result and in an export, and the key is what anything mechanical
 * matches on.
 */
function facet(
  key: string,
  label: string,
  group: FieldGroupKey,
  path: string,
  lookFor: string,
  fromFile?: true,
): FieldDef {
  return {
    key,
    label,
    group,
    type: 'facet',
    path,
    hint: `Filed under ${path}.`,
    lookFor,
    ...(fromFile ? { fromFile } : {}),
    maxLength: 120,
  };
}

/** A branch that holds something the item states. */
function value(
  key: string,
  label: string,
  group: FieldGroupKey,
  path: string,
  hint: string,
  lookFor: string,
  maxLength = 200,
): FieldDef {
  return { key, label, group, type: 'text', path, hint, lookFor, maxLength };
}

const D = 'The EHIC Archive Project > Content Domains';
const M = 'The EHIC Archive Project > Content Media Types';
const C = 'The EHIC Archive Project > Communities Mapping';

export const FIELDS: readonly FieldDef[] = [
  // ══ Record basics — columns on `items`, not from the document ══════════════
  {
    key: 'category',
    label: 'Kind of item',
    group: 'record',
    type: 'enum',
    path: '',
    column: 'category',
    options: enumOptions<ItemCategory>(CATEGORY_LABELS),
    hint: 'The three kinds the portal filters by. The media-type branches below are finer.',
    lookFor: 'Whether this is a physical object, a document or page, or a recording.',
    maxLength: 40,
  },
  {
    key: 'community',
    label: 'Community',
    group: 'record',
    type: 'enum',
    path: '',
    column: 'community',
    options: enumOptions<Community>(COMMUNITY_LABELS),
    hint: 'One of the four streams. Anything that cannot be placed in one is proposed as General India, the fifth.',
    lookFor: 'A place name, script, liturgical detail, or style that ties it to one stream. Leave it out if nothing does.',
    maxLength: 40,
  },
  {
    key: 'period',
    label: 'Period',
    group: 'record',
    type: 'text',
    path: '',
    column: 'period',
    hint: 'A range. A single year only if the item states one.',
    lookFor: 'A printed date, a dated inscription, or a style that dates it to a decade.',
    maxLength: 120,
  },
  {
    key: 'origin_place',
    label: 'Place of origin',
    group: 'record',
    type: 'text',
    path: '',
    column: 'origin_place',
    hint: 'Town and country. "Calcutta, India".',
    lookFor: 'A legible place name, a postmark, an imprint, or recognisable architecture.',
    maxLength: 200,
  },
  {
    key: 'language',
    label: 'Language',
    group: 'record',
    type: 'text',
    path: '',
    column: 'language',
    hint: 'The language of the material, not of this website.',
    lookFor: 'The dominant language of any text or speech present.',
    maxLength: 60,
  },
  {
    key: 'provenance',
    label: 'Provenance',
    group: 'record',
    type: 'text',
    path: '',
    column: 'provenance',
    hint: 'Who owned it, and how it reached the archive.',
    lookFor: 'An ownership stamp, a bookplate, a dedication, an accession mark.',
    maxLength: 2000,
  },

  // ══ The item itself — not from the document; see the header ════════════════
  value(
    'date_on_item',
    'Date written on the item',
    'item_detail',
    '',
    'Transcribed as it appears, in its own calendar. Not converted.',
    'A date printed, stamped, or handwritten on the material itself.',
    120,
  ),
  value(
    'inscription',
    'Inscription',
    'item_detail',
    '',
    'Text carried by the object itself, in its original script.',
    'Words engraved, embroidered, or stamped on the object — not the body of a document.',
    600,
  ),
  value(
    'maker',
    'Maker or photographer',
    'item_detail',
    '',
    'A studio stamp, a silversmith’s mark, a printer’s name.',
    'A maker’s mark, studio imprint, or signature.',
  ),
  value(
    'material',
    'Material',
    'item_detail',
    '',
    'What it is made of, as far as the image shows.',
    'Silver, brass, paper, parchment, cotton, silk — what the surface plainly is.',
  ),
  value(
    'condition',
    'Condition',
    'item_detail',
    '',
    'Visible damage only. Nothing about what caused it.',
    'Tears, foxing, corrosion, fading, missing parts — what is actually visible.',
    300,
  ),

  // ══ Content Domains ════════════════════════════════════════════════════════
  // Lifestyle and Customs
  facet('domain.lifestyle.traditions', 'Traditions', 'lifestyle', `${D} > Lifestyle and Customs > Traditions`,
    'A custom or observance being kept — a rite, a blessing, a communal practice.'),
  facet('domain.lifestyle.day_to_day', 'Day-to-day life', 'lifestyle', `${D} > Lifestyle and Customs > Day-to-day life`,
    'Ordinary life rather than an occasion: a street, a kitchen, a workday, a household scene.'),
  facet('domain.lifestyle.food', 'Food', 'lifestyle', `${D} > Lifestyle and Customs > Food`,
    'Food, cooking, a recipe, a vessel used for food, a meal being eaten.'),
  facet('domain.lifestyle.professions', 'Professions', 'lifestyle', `${D} > Lifestyle and Customs > Professions`,
    'A trade or occupation: tools, a workshop, a uniform, a shop sign, a business document.'),

  // Religious and Art
  facet('domain.religious.temples', 'Temples', 'religious_art', `${D} > Religious and Art > Temples`,
    'A synagogue or prayer house: its building, interior, ark, or grounds.'),
  facet('domain.religious.artifacts', 'Artifacts', 'religious_art', `${D} > Religious and Art > Artifacts`,
    'A made object of material culture that is not specifically a ritual item.'),
  facet('domain.religious.judaica', 'Judaica items', 'religious_art', `${D} > Religious and Art > Judaica items`,
    'An object made for Jewish ritual use: Torah case, pointer, menorah, mezuzah, tallit, kiddush cup.'),
  facet('domain.religious.art', 'Art', 'religious_art', `${D} > Religious and Art > Art`,
    'A work made to be looked at: a painting, a drawing, a decorated manuscript page, a sculpture.'),

  // Culture
  facet('domain.culture.literature', 'Literature and Poetry', 'culture', `${D} > Culture > Literature and Poetry`,
    'Written composition rather than record-keeping: a poem, a story, a piyyut, a printed literary work.'),
  facet('domain.culture.music_dance', 'Music and dance', 'culture', `${D} > Culture > Music and dance`,
    'Singing, playing, dancing, an instrument, a song text, or a recording of any of them.'),
  facet('domain.culture.dress', 'Dress code', 'culture', `${D} > Culture > Dress code`,
    'Clothing as the subject: a garment itself, or dress distinctive enough to be what the image is about.'),
  facet('domain.culture.homes', 'Homes and neighborhoods', 'culture', `${D} > Culture > Homes and neighborhoods`,
    'A dwelling, a street, a courtyard, a quarter — the built setting people lived in.'),

  // Circle of Life
  facet('domain.life.birth_objects', 'Birth — objects', 'circle_of_life', `${D} > Circle of Life > Early Stages > Birth > Objects`,
    'An object belonging to birth or infancy: a cradle, an amulet, a circumcision implement, naming regalia.'),
  facet('domain.life.birth_stories', 'Birth — stories', 'circle_of_life', `${D} > Circle of Life > Early Stages > Birth > Stories`,
    'An account of a birth, a naming, or the customs around them — written or recorded.'),
  facet('domain.life.birth_games', 'Birth — games', 'circle_of_life', `${D} > Circle of Life > Early Stages > Birth > Games`,
    'A game, rhyme, toy, or play custom belonging to infancy.'),
  facet('domain.life.childhood', 'Childhood', 'circle_of_life', `${D} > Circle of Life > Early Stages > Childhood`,
    'Children past infancy: school, play, a childhood portrait, a coming-of-age before marriage.'),
  facet('domain.life.maturity', 'Maturity', 'circle_of_life', `${D} > Circle of Life > Maturity`,
    'Adult life: working years, communal office, old age, a late portrait, a memorial.'),
  facet('domain.life.marriage', 'Marriage', 'circle_of_life', `${D} > Circle of Life > Marriage`,
    'A wedding, a betrothal, a ketubah, wedding dress or jewellery, a marriage record.'),

  // ══ Content Media Types ════════════════════════════════════════════════════
  // Digital Media
  // All four are settled by the file, not by looking at it. The first three
  // are set from the measured MIME type in /api/analyze; 3D has no MIME type
  // that identifies it, so it stays in the picklist for a volunteer to add.
  facet('media.digital.images', 'Images', 'digital_media', `${M} > Digital Media > Images`,
    'The file is a still image.', true),
  facet('media.digital.video', 'Video', 'digital_media', `${M} > Digital Media > Video`,
    'The file is moving footage.', true),
  facet('media.digital.sound', 'Sound', 'digital_media', `${M} > Digital Media > Sound`,
    'The file is audio.', true),
  facet('media.digital.three_d', '3D', 'digital_media', `${M} > Digital Media > 3D`,
    'The file is a three-dimensional capture or model of an object.', true),

  // Physical and Printed
  facet('media.printed.manuscripts', 'Documents and manuscripts', 'physical_printed', `${M} > Physical and Printed > Documents and manuscripts`,
    'A handwritten or typed document: a letter, a certificate, a register, a ketubah, a scroll.'),
  facet('media.printed.books', 'Printed books', 'physical_printed', `${M} > Physical and Printed > Printed books`,
    'A bound printed volume, or a page plainly from one.'),
  facet('media.printed.newspapers', 'Newspaper articles', 'physical_printed', `${M} > Physical and Printed > Newspaper articles`,
    'A newspaper or periodical page, cutting, or masthead.'),
  facet('media.printed.clothing', 'Clothing', 'physical_printed', `${M} > Physical and Printed > Physical Assets > Clothing`,
    'A garment or textile held as a physical asset: a sari, a robe, a shawl, a head covering.'),
  facet('media.printed.jewelry', 'Jewelry', 'physical_printed', `${M} > Physical and Printed > Physical Assets > Jewelry`,
    'Worn ornament: necklaces, bangles, earrings, rings, hair ornaments.'),
  facet('media.printed.furniture', 'Furniture', 'physical_printed', `${M} > Physical and Printed > Physical Assets > Furniture`,
    'A piece of furniture or a fitting: a chair, a chest, a reading desk, an ark cabinet.'),

  // ══ Communities Mapping ════════════════════════════════════════════════════
  // Geography
  value('map.geo.district_state', 'District and State', 'geography', `${C} > Geography > District and State`,
    'The Indian state or district, when the item names one.',
    'A state or district written on the item — Maharashtra, Kerala, Bengal, Raigad.',
    120),
  value('map.geo.cities_villages', 'Cities and Villages', 'geography', `${C} > Geography > Cities and Villages`,
    'The settlement, as the item spells it.',
    'A town or village named on the item — Bombay, Cochin, Alibag, Revdanda.',
    160),
  value('map.geo.markets', 'Markets', 'geography', `${C} > Geography > Markets`,
    'A named market or bazaar.',
    'A market or bazaar named on the item, or plainly identifiable in it.',
    160),

  // Social Infrastructure
  value('map.social.education', 'Educational institutions', 'social_infrastructure', `${C} > Social Infrastructure > Educational institutions`,
    'A named school, seminary, or college.',
    'The name of a school or college on a building, a certificate, a uniform, or a letterhead.'),
  value('map.social.doctors', 'Doctors', 'social_infrastructure', `${C} > Social Infrastructure > Health > Doctors`,
    'A named physician.',
    'A doctor named on a prescription, a plate, a certificate, or a caption.'),
  value('map.social.birth_nurses', 'Birth nurses', 'social_infrastructure', `${C} > Social Infrastructure > Health > Birth nurses`,
    'A named midwife or birth attendant.',
    'A midwife or birth attendant named on the item.'),
  value('map.social.healers', 'Healers', 'social_infrastructure', `${C} > Social Infrastructure > Health > Healers`,
    'A named traditional healer, and the practice if it is stated.',
    'A healer named on the item, or a healing practice it documents.'),
  value('map.social.medications', 'Medications', 'social_infrastructure', `${C} > Social Infrastructure > Health > Medications`,
    'A named remedy or preparation.',
    'A medicine, remedy, or preparation named on a label, a prescription, or a page.'),
  value('map.social.transportation', 'Transportation', 'social_infrastructure', `${C} > Social Infrastructure > Transportation`,
    'The means of travel the item documents.',
    'A vessel, railway, line, or vehicle named or plainly shown.'),

  // History and Data
  value('map.history.events', 'Important events', 'history_data', `${C} > History and Data > Important events`,
    'A named event the item records or belongs to.',
    'An event named on the item — a dedication, a visit, a migration, a founding, a disaster.',
    300),
  value('map.history.key_people', 'Key people', 'history_data', `${C} > History and Data > Key people`,
    'People the item names. Only names it carries — a face is not a name.',
    'Names in a caption, an inscription, a signature, or a document body.',
    300),
  value('map.history.transformations', 'Social transformations', 'history_data', `${C} > History and Data > Social transformations`,
    'A shift the item documents: migration, a change of trade, a change in observance.',
    'Evidence of a community-wide change stated in the material, not inferred from its date.',
    300),
  value('map.history.statistics', 'Statistics', 'history_data', `${C} > History and Data > Statistics`,
    'Figures the item states — a census count, a membership roll, a subscription list.',
    'Numbers about a community written on the item. Never a figure you calculated.',
    300),
] as const;

const BY_KEY = new Map(FIELDS.map((field) => [field.key, field]));

export const FIELD_KEYS = FIELDS.map((f) => f.key);

/** The vocabulary the model is given. Excludes anything the file already answers. */
export const MODEL_FIELDS = FIELDS.filter((f) => !f.fromFile);

/**
 * One field on one record, as the editing screens hold it.
 *
 * The provenance half is optional because a field a person just added from the
 * picklist has none yet — it is theirs, and saying "Guess" beside it would be
 * both wrong and insulting.
 */
export interface FieldValue {
  key: string;
  value: string;
  source?: 'ai' | 'contributor' | 'volunteer';
  basis?: EvidenceBasis | null;
  note?: string | null;
  /**
   * What the machine proposed, kept beside what the field now holds.
   *
   * It is the only way to tell a *correction* from an *addition*: both end up
   * as a person's value, but one of them overrode a reading and the other
   * filled a silence. The screen marks the first and leaves the second alone,
   * and the server applies the identical rule when it decides whether a row is
   * `ai` or `contributor` — see writeFields.
   *
   * Absent on a field nobody proposed.
   */
  suggested?: string | null;
}

/** Has a person overridden what the machine read here? */
export function isCorrected(field: FieldValue): boolean {
  return (
    typeof field.suggested === 'string' &&
    field.suggested.length > 0 &&
    field.value.trim() !== field.suggested
  );
}

export function fieldDef(key: string): FieldDef | undefined {
  return BY_KEY.get(key);
}

export function fieldLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

/** The tree fields held as rows rather than as columns on `items`. */
export const ROW_FIELDS = FIELDS.filter((f) => !f.column);

/**
 * The value this field will actually store, or null if it will not take it.
 *
 * Normalising rather than merely checking, because most of what arrives is
 * nearly right and rejecting it wastes a reading the model genuinely made:
 *
 *   enum   `bene_israel` is a Postgres enum value. "Bene-Israel" would reach
 *          the column and be rejected there, several layers from anything that
 *          could explain why — so it is matched against the labels too.
 *   facet  its value is its own name. A model asked whether an item belongs
 *          under "Food" tends to answer "yes", or "Food", or "food"; all three
 *          mean the same thing and all three become "Food".
 */
export function normaliseValue(key: string, raw: string): string | null {
  const def = BY_KEY.get(key);
  if (!def) return null;

  const value = raw.trim();
  if (!value) return null;

  if (def.type === 'facet') {
    const said = value.toLowerCase();
    const affirmative = said === 'yes' || said === 'true' || said === def.label.toLowerCase();
    return affirmative ? def.label : null;
  }

  if (def.type === 'enum') {
    const match = (def.options ?? []).find(
      (o) =>
        o.value.toLowerCase() === value.toLowerCase() ||
        o.label.toLowerCase() === value.toLowerCase(),
    );
    return match?.value ?? null;
  }

  return value.length <= def.maxLength ? value : null;
}

/** Convenience for callers that only need the yes/no. */
export function isValidValue(key: string, value: string): boolean {
  return normaliseValue(key, value) !== null;
}

/** Sorts field keys into the tree's own order, so no two screens differ. */
export function inTreeOrder<T>(entries: T[], keyOf: (entry: T) => string): T[] {
  const rank = new Map(FIELD_KEYS.map((key, index) => [key, index]));
  return [...entries].sort((a, b) => (rank.get(keyOf(a)) ?? 999) - (rank.get(keyOf(b)) ?? 999));
}
