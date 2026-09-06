import type { FieldSuggestion } from '@/lib/fields/suggestions';
import type { Community, EvidenceLedger, ItemCategory } from '@/lib/types';

export interface AnalysisInput {
  /**
   * The archive's controlled subject list, grouped under the tree branches it
   * subdivides. Optional so a provider can be exercised without a database;
   * absent means the model is given no list and returns free text.
   */
  vocabulary?: import('@/lib/vocabulary/thesaurus').VocabularyBranch[];
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
  /** May be empty. The contribution screen no longer insists on one. */
  title: string;
  /** The contributor's own account of the object. Treated as verified fact. */
  known?: string;
  /** The language the reading should come back in. */
  language?: string;
}

export interface AnalysisResult {
  provider: string;
  model: string;
  /** Two sentences describing what the item appears to contain. */
  summary: string;
  /** About five concepts. Suggested, never authoritative. */
  keywords: string[];
  /**
   * Words the vocabulary does not hold, each naming the branch it subdivides.
   *
   * Kept apart from `keywords` because they are proposals, not values: they
   * queue at /manage/vocabulary for a volunteer and never reach a record until
   * one is accepted. See migration 0021.
   */
  newTerms: { term: string; branchKey: string }[];
  /** The dominant language of the material, not of the interface. */
  language: string | null;
  /** The model's own confidence, 0 to 1. Kept so reviewers can triage. */
  confidence: number;
  /**
   * The logical tree's fields, already gated.
   *
   * Every entry here cleared 70% *after* its basis was applied, so this array
   * is exactly what a volunteer is offered — nothing is filtered again further
   * down. Fields the model could not support are absent, not empty.
   *
   * The four `suggested*` values below are views of this array, kept because
   * they map to columns the portal reads. They are derived, never independent.
   */
  fields: FieldSuggestion[];
  /** Verbatim text in its original script, when the material carries text. */
  ocrText: string | null;
  /** Speech transcription, for audio and video. */
  transcript: string | null;
  /**
   * Which of the three kinds of item this is, as the model reads it. Nobody
   * asks the contributor any more — see migration 0011 — so this is the
   * archive's first pass at cataloguing, and a reviewer's to confirm.
   */
  suggestedCategory: ItemCategory | null;
  /**
   * A guess a reviewer may accept or overrule. Null only when the model judged
   * the item to be outside the archive altogether — everything else that cannot
   * be placed is proposed as General India.
   */
  suggestedCommunity: Community | null;
  /**
   * The model's judgement that this is not the archive's material.
   *
   * Deliberately separate from the community: General India is a shelf for
   * Indian Jewish material nothing narrows further, and a holiday photograph
   * does not belong on it. A suggestion like any other — it never reaches
   * `items`, it puts the record in its own group in the queue, and a volunteer
   * decides.
   */
  offTopic: boolean;
  /** One clause saying what made it look unrelated. Null when it did not. */
  offTopicReason: string | null;
  /** Free text, deliberately not a year: "1890s", "late 19th century". */
  suggestedPeriod: string | null;
  /** Where the item appears to come from: "Calcutta, India". */
  suggestedOrigin: string | null;
  /** What the model based its dating and placing on, so a reviewer can weigh it. */
  reasoning: string | null;
  /**
   * Per field, what the value rests on: read from the material, inferred from
   * style, or guessed. This is what a reviewer actually judges - see ADR-012.
   */
  evidence: EvidenceLedger | null;
  raw: unknown;
}

export interface AIProvider {
  readonly id: string;
  readonly model: string;
  /** True when the output is fabricated and the UI must say so. */
  readonly isSimulated: boolean;
  analyze(input: AnalysisInput): Promise<AnalysisResult>;
}
