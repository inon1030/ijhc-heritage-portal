import { beforeAll, describe, expect, it } from 'vitest';
import { CollectorInput, PublicInput, correctionChanges, hasTooManyLinks } from '@/lib/items/public-input';
import { publicToken, tokenHash, verifyPublicToken } from '@/lib/items/public-tokens';
import { recordFeedbackMail } from '@/lib/mail/templates';
import fs from 'node:fs';

beforeAll(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = 'public-feedback-test-secret'; });

describe('public feedback boundaries', () => {
  it('requires an actual collector name only when credit is required', () => {
    expect(CollectorInput.safeParse({ collectorName: '  ', collectorCreditRequired: true }).success).toBe(false);
    expect(CollectorInput.safeParse({ collectorName: null, collectorCreditRequired: false }).success).toBe(true);
  });
  it('requires a name and valid email unless anonymous', () => {
    expect(PublicInput.safeParse({ anonymous: false, token: 'x', body: 'Hello' }).success).toBe(false);
    expect(PublicInput.safeParse({ anonymous: true, token: 'x', body: 'Hello' }).success).toBe(true);
    expect(PublicInput.safeParse({ anonymous: false, name: 'Person', email: 'bad', token: 'x' }).success).toBe(false);
  });
  it('enforces the signed three-second window and binds it to a record and purpose', () => {
    const token = publicToken('form', 'record', 10000);
    expect(verifyPublicToken('form', 'record', token, 12999)).toBe(false);
    expect(verifyPublicToken('form', 'record', token, 13000)).toBe(true);
    expect(verifyPublicToken('form', 'other', token, 13000)).toBe(false);
    expect(verifyPublicToken('objection', 'record', token, 13000)).toBe(false);
    expect(verifyPublicToken('form', 'record', `${token}x`, 13000)).toBe(false);
    expect(verifyPublicToken('form', 'record', token, 9999)).toBe(false);
    expect(verifyPublicToken('form', 'record', token, 10000 + 86400001)).toBe(false);
  });
  it('expires objection links after thirty days and stores only their hash', () => {
    const token = publicToken('objection', 'correction', 10000);
    expect(verifyPublicToken('objection', 'correction', token, 10000 + 30 * 86400000)).toBe(true);
    expect(verifyPublicToken('objection', 'correction', token, 10001 + 30 * 86400000)).toBe(false);
    expect(tokenHash(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHash(token)).not.toContain(token);
  });
  it('limits links independently of the text length', () => {
    expect(hasTooManyLinks('https://a.test www.b.test')).toBe(false);
    expect(hasTooManyLinks('https://a.test www.b.test http://c.test')).toBe(true);
  });
  it('refuses protected fields, empty changes and stale snapshots', () => {
    const fields = [{ key: 'title', label: 'Title', value: 'Original', maxLength: 200 }];
    expect(correctionChanges({ title: 'Revised' }, fields, { title: 'Original' })).toEqual({ title: { from: 'Original', to: 'Revised' } });
    expect(() => correctionChanges({ title: 'Original' }, fields)).toThrow('no_changes');
    expect(() => correctionChanges({ status: 'accepted' }, fields)).toThrow('invalid_field');
    expect(() => correctionChanges({ title: '' }, fields)).toThrow('invalid_field');
    expect(() => correctionChanges({ title: 'Revised' }, fields, { title: 'Older' })).toThrow('stale_field');
  });
  it('escapes public text in localized emails and includes every proposed change', () => {
    const mail = recordFeedbackMail({ to: 'one@example.org', language: 'he', title: '<script>bad</script>',
      kind: 'correction', body: '<img onerror="bad">', changes: { title: { from: 'Old', to: 'New' } },
      publicUrl: 'https://example.org/portal/1', objectionUrl: 'https://example.org/corrections/1/objection?t=secret' });
    expect(mail.html).toContain('dir="rtl"');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<img');
    expect(mail.text).toContain('Old → New');
    expect(mail.text).toContain('בקשה שלא לבצע את השינוי');
    expect(mail.text).not.toContain('Ask that');
  });
  it('uses a bilingual fallback only for recipients without a known language', () => {
    const mail = recordFeedbackMail({ to: 'one@example.org', language: null, title: 'Record', kind: 'comment', body: 'Comment', publicUrl: 'https://example.org' });
    expect(mail.html).toContain('dir="rtl"');
    expect(mail.html).toContain('dir="ltr"');
  });
  it('migration conceals contact columns, retains item RLS, and locks concurrent decisions', () => {
    const sql = fs.readFileSync('supabase/migrations/0037_the_public_may_speak.sql', 'utf8');
    expect(sql).toContain('security_invoker = true');
    expect(sql).toContain('revoke all on public.record_comments from anon, authenticated');
    expect(sql).not.toMatch(/grant select\s*\([^)]*author_email/);
    expect(sql).not.toMatch(/create policy .*for insert/i);
    expect(sql).not.toMatch(/(?:drop|alter) policy/);
    expect(sql).toContain('security invoker');
    expect(sql).toContain('c.objection_at is distinct from p_objection_at');
    expect(sql).toContain("raise exception 'Correction is stale'");
    expect(sql).toContain("values(c.item_id,auth.uid(),'edited'");
  });
});
