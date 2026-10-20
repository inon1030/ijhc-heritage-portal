import { fieldDef } from '@/lib/fields/registry';
import type { Community, ItemCategory } from '@/lib/types';

export const FACETS = ['community', 'category', 'keyword', 'family', 'period', 'origin', 'kind', 'language', 'field'] as const;
export type Facet = typeof FACETS[number];
export type FacetFilters = Partial<Record<Facet, string>> & { from?: string; to?: string };
export interface FacetRow {
  id: string;
  created_at: string;
  reviewed_at: string | null;
  category: ItemCategory | null;
  community: Community | null;
  keywords: string[];
  period: string | null;
  origin_place: string | null;
  language: string | null;
  item_fields: { field_key: string; value: string }[];
  item_files: { mime_type: string }[];
  item_families: { families: { id: string; name: string } | null }[];
}
export interface FacetOption { value: string; label: string; count: number }
export type FacetOptions = Record<Facet, FacetOption[]>;

export function discreteField(key: string): boolean {
  const def = fieldDef(key);
  return Boolean(def && !def.column && (def.type === 'facet' || def.type === 'enum'));
}

export function fieldValue(key: string, value: string): string {
  return JSON.stringify([key, value]);
}

export function facetValues(row: FacetRow, facet: Facet): { value: string; label: string }[] {
  const values = (entries: (string | null)[]) => [...new Set(entries.filter((s): s is string => Boolean(s)))].map(value => ({ value, label: value }));
  switch (facet) {
    case 'keyword': return values(row.keywords);
    case 'family': return row.item_families.flatMap(({ families }) => families ? [{ value: families.id, label: families.name }] : []);
    case 'origin': return values([row.origin_place]);
    case 'kind': return values(row.item_files.map(file => {
      if (file.mime_type.startsWith('image/')) return 'photograph';
      if (file.mime_type.startsWith('audio/')) return 'audio';
      if (file.mime_type.startsWith('video/')) return 'video';
      return file.mime_type === 'application/pdf' || file.mime_type.startsWith('text/') ? 'document' : null;
    }));
    case 'field': return row.item_fields.filter(f => discreteField(f.field_key)).map(f => ({ value: fieldValue(f.field_key, f.value), label: f.value }));
    default: return values([row[facet]]);
  }
}

export function validDay(day: string | undefined): string | undefined {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : undefined;
}

export function matchesFacets(row: FacetRow, filters: FacetFilters, except?: Facet): boolean {
  if (!FACETS.every(key => key === except || !filters[key] || facetValues(row, key).some(v => v.value === filters[key]))) return false;
  const from = validDay(filters.from);
  const to = validDay(filters.to);
  const day = row.reviewed_at?.slice(0, 10);
  return (!from || Boolean(day && day >= from)) && (!to || Boolean(day && day <= to));
}

/** Counts are distinct records, not occurrences or files. Each facet excludes itself. */
export function facetOptions(rows: FacetRow[], filters: FacetFilters = {}): FacetOptions {
  return Object.fromEntries(FACETS.map(key => {
    const counts = new Map<string, FacetOption>();
    for (const row of rows.filter(row => matchesFacets(row, filters, key))) {
      for (const entry of new Map(facetValues(row, key).map(v => [v.value, v])).values()) {
        const old = counts.get(entry.value);
        counts.set(entry.value, { ...entry, count: (old?.count ?? 0) + 1 });
      }
    }
    return [key, [...counts.values()].sort((a, b) => a.label.localeCompare(b.label))];
  })) as FacetOptions;
}

export function searchWords(query: string): string[] {
  return [...new Set(query.trim().toLowerCase().split(/\s+/u).filter(Boolean))];
}

export function intersectIds(groups: string[][]): string[] {
  if (!groups.length) return [];
  const sets = groups.slice(1).map(group => new Set(group));
  return [...new Set(groups[0])].filter(id => sets.every(group => group.has(id)));
}

export function portalHref(key: string, value: string): string {
  return `/portal?${new URLSearchParams({ [key]: value })}`;
}

export function hasPortalFilters(filters: FacetFilters & { query?: string }): boolean {
  return Boolean(filters.query?.trim() || FACETS.some(key => filters[key]) || validDay(filters.from) || validDay(filters.to));
}

export function pagination(total: number, requested: string | undefined, size = 48) {
  const input = Number(requested);
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Number.isSafeInteger(input) && input > 0 ? input : 1, pages);
  return { page, pages, offset: (page - 1) * size };
}
