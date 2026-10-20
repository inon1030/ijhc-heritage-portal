import { z } from 'zod';
import { discreteField } from './portal-facets';
import { isValidValue } from '@/lib/fields/registry';

export const CollectorInput = z.object({
  collectorName: z.string().trim().max(200).nullable(),
  collectorCreditRequired: z.boolean(),
}).refine(v => !v.collectorCreditRequired || Boolean(v.collectorName), { path: ['collectorName'] });

export const PublicInput = z.object({
  anonymous: z.boolean(),
  name: z.string().trim().max(120).default(''),
  email: z.string().trim().max(254).default(''),
  website: z.string().max(200).default(''),
  token: z.string().max(200),
  body: z.string().trim().max(2000).default(''),
  values: z.record(z.string().max(120), z.string().trim().max(4000)).optional(),
  originals: z.record(z.string().max(120), z.string().max(4000)).optional(),
}).refine(v => v.anonymous || (v.name.length >= 2 && z.email().safeParse(v.email).success));

export type CorrectionChanges = Record<string, { from: string; to: string }>;
export type CorrectionField = { key: string; label: string; value: string; maxLength: number; options?: { value: string; label: string }[] };
export function correctionChanges(values: Record<string, string>, fields: CorrectionField[], originals?: Record<string, string>): CorrectionChanges {
  const changes: CorrectionChanges = {};
  for (const [key, value] of Object.entries(values)) {
    const field = fields.find(f => f.key === key);
    if (!field || value.length > field.maxLength || (key === 'title' && !value.trim())) throw new Error('invalid_field');
    if (originals && originals[key] !== field.value) throw new Error('stale_field');
    if (key.startsWith('field:') && (!discreteField(key.slice(6)) || (value && !isValidValue(key.slice(6), value)))) throw new Error('invalid_field');
    if (field.value !== value) changes[key] = { from: field.value, to: value };
  }
  if (!Object.keys(changes).length) throw new Error('no_changes');
  return changes;
}
export function hasTooManyLinks(text: string): boolean {
  return (text.match(/(?:https?:\/\/|www\.)[^\s]+/gi) ?? []).length > 2;
}
