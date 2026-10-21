import { z } from 'zod';
import { ACCESS_LEVELS } from '@/lib/access';
import { CATEGORIES, COMMUNITIES } from '@/lib/types';

export const DraftPayload = z.object({
  baseReviewedAt: z.string().nullable().optional(),
  readings: z.array(z.object({ analysisId: z.string().uuid(), field: z.enum(['ocrText', 'transcript']), text: z.string().max(100000) })).max(100).optional(),
  title: z.string().max(200),
  description: z.string().max(4000),
  category: z.union([z.enum(CATEGORIES), z.literal('')]),
  community: z.union([z.enum(COMMUNITIES), z.literal('')]),
  provenance: z.string().max(2000),
  language: z.string().max(60),
  period: z.string().max(120),
  originPlace: z.string().max(200),
  keywords: z.array(z.string().trim().min(1).max(80)),
  familyIds: z.array(z.string().uuid()).max(12),
  access: z.enum(ACCESS_LEVELS),
  fields: z.array(z.object({ key: z.string().max(120), value: z.string().max(2000) })).max(100),
});
export type ReviewDraftPayload = z.infer<typeof DraftPayload>;
