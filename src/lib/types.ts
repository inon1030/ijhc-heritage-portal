export type UserRole = 'pending' | 'volunteer' | 'admin';
export type ItemStatus = 'pending' | 'accepted' | 'rejected' | 'shadow_gallery';
export type ItemCategory = 'material_culture' | 'documents' | 'oral_histories';
export type Community = 'bene_israel' | 'cochin' | 'baghdadi' | 'bnei_menashe' | 'general_india';
export type AccessLevel = 'public' | 'restricted' | 'research' | 'administrative';
export type AnalysisStatus = 'succeeded' | 'failed';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

export interface Item {
  id: string;
  title: string;
  description: string | null;
  /**
   * Null until a reviewer sets it. Nobody asks the contributor any more, and
   * writing the model's guess straight in here would be the one thing this
   * schema exists to prevent. See migration 0011.
   */
  category: ItemCategory | null;
  community: Community | null;
  provenance: string | null;
  source: string | null;
  /**
   * The address a record was captured from, when it came from one.
   *
   * Kept apart from `source`, which is free text a person types ("The Elias
   * family, Mumbai"). This one is machine-written and exact, so it can be
   * linked, checked, and used to notice the same article arriving twice.
   */
  source_url: string | null;
  keywords: string[];
  language: string | null;
  period: string | null;
  origin_place: string | null;
  /**
   * The person who sent it, when they left an address.
   *
   * Points at the contributor register rather than holding an address on the
   * row, so that one person is one row however many things they send, and so
   * that the families they belong to can be recorded against them. Volunteers
   * read the register; the public never does. See migration 0020.
   */
  contributor_id: string | null;
  /**
   * The contributor's own words, kept apart from `description`, which only a
   * reviewer writes. A contributor accepting the machine's text unchanged has
   * not thereby published machine text — see ADR-013.
   */
  contributor_description: string | null;
  contributor_keywords: string[];
  /** Which version of the handling notice they agreed to, and when. */
  consent_version: string | null;
  consent_at: string | null;
  status: ItemStatus;
  access: AccessLevel;
  submitted_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  /**
   * The bin. Set by a volunteer, cleared only by an administrator.
   *
   * A binned record keeps its status and its access level, so restoring it
   * puts back the review decision that was already made rather than sending it
   * round the queue again. Every read policy excludes it — see migration 0018.
   */
  deleted_at: string | null;
  deleted_by: string | null;
  deleted_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemFile {
  id: string;
  item_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  checksum: string | null;
  /**
   * A browser-viewable derivative of a master no browser renders — a TIFF scan.
   * Null when the master is itself viewable. The master is never modified.
   */
  preview_path: string | null;
  is_primary: boolean;
  /** Page order within one record. Page 1 before page 2. */
  position: number;
  created_at: string;
}

export interface AiAnalysis {
  id: string;
  item_id: string;
  provider: string;
  model: string;
  status: AnalysisStatus;
  error: string | null;
  summary: string | null;
  keywords: string[];
  language: string | null;
  confidence: number | null;
  ocr_text: string | null;
  transcript: string | null;
  suggested_category: ItemCategory | null;
  suggested_community: Community | null;
  suggested_period: string | null;
  suggested_origin: string | null;
  reasoning: string | null;
  evidence: EvidenceLedger | null;
  /**
   * The model's judgement that this is not the archive's material. A suggestion
   * only — it groups the record in the review queue and never touches `items`.
   * General India is for material that *is* India's and cannot be narrowed; a
   * holiday photograph does not belong on that shelf.
   */
  off_topic: boolean;
  off_topic_reason: string | null;
  /** Which file this analysis looked at. Null on rows predating multi-file records. */
  file_id: string | null;
  raw: unknown;
  created_at: string;
}

/**
 * What each suggestion rests on. Replaces the confidence percentage as the
 * thing a reviewer reads — see ADR-012. A reviewer cannot judge "87%"; they can
 * judge "the barricades read MUMBAI POLICE".
 */
export type EvidenceBasis = 'read' | 'inferred' | 'guess';

export interface EvidenceEntry {
  basis: EvidenceBasis;
  note: string | null;
}

/**
 * Keyed by field key from the logical tree — see src/lib/fields/registry.ts.
 *
 * It was a closed union of six names until the tree arrived. Rows written
 * before that still carry the old keys, so nothing here narrows: labels are
 * resolved through the registry first and LEGACY_EVIDENCE_LABELS second.
 */
export type EvidenceLedger = Record<string, EvidenceEntry>;

export const EVIDENCE_BASIS_LABELS: Record<EvidenceBasis, string> = {
  read: 'Read from the material',
  inferred: 'Inferred from style',
  guess: 'Guess',
};

/** Field names used by analyses stored before the tree. */
export const LEGACY_EVIDENCE_LABELS: Record<string, string> = {
  summary: 'Description',
  origin: 'Origin',
  keywords: 'Keywords',
};

/**
 * One field of the logical tree, on one record.
 *
 * Only the branches that have no column of their own. `community` and the other
 * five that the portal filters on stay where they were; putting them here as
 * well would give every reader two places to look and one of them would go
 * stale. The registry's `column` marks which is which.
 */
export interface ItemField {
  id: string;
  item_id: string;
  field_key: string;
  value: string;
  /** Who put it there. AI values are proposals until a volunteer approves them. */
  source: 'ai' | 'contributor' | 'volunteer';
  /** Only for `ai` rows, and always at or above the 70% threshold. */
  confidence: number | null;
  basis: EvidenceBasis | null;
  note: string | null;
  created_at: string;
}

export interface ItemEvent {
  id: string;
  item_id: string;
  actor_id: string | null;
  action: string;
  from_status: ItemStatus | null;
  to_status: ItemStatus | null;
  changes: Record<string, unknown> | null;
  created_at: string;
}

/** An item with everything the review and record screens need. */
export interface ItemDetail extends Item {
  /** The record's cover — the primary file. Null only if the row lost its file. */
  file: ItemFile | null;
  /** Every file on the record, primary first, then page order. */
  files: ItemFile[];
  /** The analysis of the primary file. Each file is read on its own. */
  analysis: AiAnalysis | null;
  /** The tree fields held as rows: AI proposals above 70%, and anything added by hand. */
  fields: ItemField[];
  /** Who sent it, with the families they are known to belong to. Null if they left no address. */
  contributor: ContributorDetail | null;
}

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  material_culture: 'Material Culture',
  documents: 'Documents',
  oral_histories: 'Oral Histories',
};

export const COMMUNITY_LABELS: Record<Community, string> = {
  bene_israel: 'Bene Israel',
  cochin: 'Cochin',
  baghdadi: 'Baghdadi',
  bnei_menashe: 'Bnei Menashe',
  /*
   * The fifth stream, and the archive's catch-all. Two different things land
   * here and both are deliberate rather than a failure:
   *
   *   material that is plainly Indian Jewish and cannot be narrowed further
   *   material that does not appear to belong to the archive at all
   *
   * The second is why a volunteer still has to look. Being filed under General
   * India is not the same as being published: the four-stream rule counts
   * published records, so a photograph of lunch is proposed here, rejected in
   * review, and never reaches the masthead.
   */
  general_india: 'General India',
};

export const STATUS_LABELS: Record<ItemStatus, string> = {
  pending: 'Pending review',
  accepted: 'Published',
  rejected: 'Rejected',
  shadow_gallery: 'Shadow Gallery',
};

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as ItemCategory[];

/**
 * A record's category, or the honest word for not having one yet.
 *
 * Every screen that shows a category has to handle null now, because nobody
 * assigns one at submission. "Not catalogued" is the truth and is more useful
 * to a reader than a blank.
 */
export function categoryLabel(category: ItemCategory | null): string {
  return category ? CATEGORY_LABELS[category] : 'Not catalogued';
}
export const COMMUNITIES = Object.keys(COMMUNITY_LABELS) as Community[];

/** A term a volunteer may attach to a record. Records take nothing else. */
export interface Keyword {
  id: string;
  term: string;
  /** Null means the term is offered for every community. */
  community: Community | null;
  created_by: string | null;
  created_at: string;
}

/** A term the model proposed that the vocabulary does not hold yet. */
export interface KeywordCandidate {
  id: string;
  term: string;
  community: Community | null;
  seen_count: number;
  first_item_id: string | null;
  status: 'open' | 'accepted' | 'declined';
  created_at: string;
}

/**
 * Somebody who has sent the archive material, or somebody a volunteer has
 * recorded as belonging to a family. Volunteers only — this never reaches the
 * portal.
 */
export interface Contributor {
  id: string;
  email: string;
  /** Asked for at upload. The surname is the strongest signal for which family. */
  full_name: string | null;
  created_at: string;
}

export interface ContributorDetail extends Contributor {
  /** The families a volunteer has linked this address to. */
  families: Family[];
  /** How many records this contributor has sent, this one included. */
  submissions: number;
}

export interface Family {
  id: string;
  name: string;
  community: Community;
  notes: string | null;
  created_at: string;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  pending: 'Awaiting approval',
  volunteer: 'Volunteer',
  admin: 'Administrator',
};
