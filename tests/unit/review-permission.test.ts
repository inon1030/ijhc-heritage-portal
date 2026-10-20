import { describe, expect, it } from 'vitest';
import { canEditRecord } from '@/lib/items/edit-permission';
import { DraftPayload } from '@/lib/items/draft-schema';

const expert = { id: 'expert', role: 'volunteer' as const };
const published = { status: 'accepted' as const, reviewed_by: 'other', uploaded_by: null, deleted_at: null };
describe('published ownership', () => {
  it('allows only uploader, approver or administrator', () => {
    expect(canEditRecord(expert, published)).toBe(false);
    expect(canEditRecord(expert, { ...published, uploaded_by: expert.id })).toBe(true);
    expect(canEditRecord(expert, { ...published, reviewed_by: expert.id })).toBe(true);
    expect(canEditRecord({ ...expert, role: 'admin' }, published)).toBe(true);
  });
  it('does not infer an uploader for legacy records', () => {
    expect(canEditRecord(expert, { status: 'accepted', reviewed_by: null })).toBe(false);
  });
  it.each(['pending', 'rejected', 'shadow_gallery'] as const)('keeps the %s queue open to all experts', status => {
    expect(canEditRecord(expert, { ...published, status })).toBe(true);
  });
  it('denies pending accounts, strangers and binned records', () => {
    expect(canEditRecord(null, published)).toBe(false);
    expect(canEditRecord({ ...expert, role: 'pending' }, { ...published, uploaded_by: expert.id })).toBe(false);
    expect(canEditRecord({ ...expert, role: 'admin' }, { ...published, deleted_at: '2026-10-20' })).toBe(false);
  });
});
it('allows incomplete drafts without allowing unbounded or arbitrary payloads', () => {
  const draft = { title: '', description: '', category: '', community: '', provenance: '', language: '', period: '', originPlace: '', keywords: [], familyIds: [], access: 'public', fields: [] };
  expect(DraftPayload.safeParse(draft).success).toBe(true);
  expect(DraftPayload.safeParse({ ...draft, description: 'x'.repeat(4001) }).success).toBe(false);
  expect(DraftPayload.safeParse({ ...draft, access: 'secret' }).success).toBe(false);
});
