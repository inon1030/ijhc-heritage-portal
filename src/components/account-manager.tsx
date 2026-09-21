'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useMessages } from '@/lib/i18n/provider';
import { Loader2, Mail, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { ROLE_LABELS, type Profile, type UserRole } from '@/lib/types';
import { formatDate } from '@/lib/utils';

/**
 * Who may review, and who is still waiting to be told.
 *
 * A requested account already exists and can already sign in — it simply has no
 * rights, because `profiles.role` starts at 'pending'. Approving is the moment
 * it becomes able to see the queue.
 */
export function AccountManager({ accounts, currentId }: { accounts: Profile[]; currentId: string }) {
  const t = useMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function send(url: string, init: RequestInit) {
    setError(null);
    const response = await fetch(url, init);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? t('error.didNotGoThrough'));
      return;
    }
    startTransition(() => router.refresh());
  }

  async function setRole(profile: Profile, role: UserRole) {
    setBusyId(profile.id);
    await send(`/api/manage/accounts/${profile.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    setBusyId(null);
  }

  // Which mail an account gets (22.09.2026). Saved on each tick.
  async function setNotice(profile: Profile, notice: 'notifyUploads' | 'notifyPublications', value: boolean) {
    setBusyId(profile.id);
    await send(`/api/manage/accounts/${profile.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [notice]: value }),
    });
    setBusyId(null);
  }

  async function decline(profile: Profile) {
    setBusyId(profile.id);
    await send(`/api/manage/accounts/${profile.id}`, { method: 'DELETE' });
    setBusyId(null);
    setConfirming(null);
  }

  const waiting = accounts.filter((a) => a.role === 'pending');
  const approved = accounts.filter((a) => a.role !== 'pending');
  const adminCount = accounts.filter((a) => a.role === 'admin').length;

  return (
    <div className="space-y-10">
      {error && (
        <p role="alert" className="rounded-lg border-s-[3px] border-critical bg-critical/8 px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}

      <section>
        <h2 className="font-display text-xl">
          Waiting for a decision
          {waiting.length > 0 && (
            <span className="ms-2 rounded-full bg-accent px-2.5 py-0.5 font-mono text-sm text-ink">
              {waiting.length}
            </span>
          )}
        </h2>

        {waiting.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-surface px-6 py-8 text-center text-muted">
            {t('accounts.nobodyWaiting')}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {waiting.map((profile) => (
              <li key={profile.id} className="flex flex-wrap items-center gap-3 py-4">
                <span className="min-w-[14rem] flex-1">
                  <span className="block font-medium">{profile.full_name ?? t('accounts.noName')}</span>
                  <span className="machine block text-muted">{profile.email}</span>
                  <span className="text-xs text-muted">Asked {formatDate(profile.created_at)}</span>
                </span>

                <button
                  type="button"
                  onClick={() => setRole(profile, 'volunteer')}
                  disabled={busyId === profile.id}
                  className="flex h-11 items-center gap-2 bg-primary px-4 font-medium text-white transition-colors hover:bg-primary-strong disabled:opacity-50"
                >
                  {busyId === profile.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <UserCheck size={16} />
                  )}
                  Approve as knowledge expert
                </button>

                <button
                  type="button"
                  onClick={() => setRole(profile, 'admin')}
                  disabled={busyId === profile.id}
                  className="flex h-11 items-center gap-2 rounded-full border border-accent px-5 font-medium text-accent transition-colors duration-200 hover:bg-accent-wash disabled:opacity-50"
                >
                  <ShieldCheck size={16} />
                  {t('accounts.asAdministrator')}
                </button>

                {confirming === profile.id ? (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => decline(profile)}
                      className="h-11 rounded-full bg-critical px-5 font-medium text-paper transition-transform duration-200"
                    >
                      {t('accounts.deleteForGood')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="h-11 px-3 text-muted underline"
                    >
                      {t('accounts.keep')}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(profile.id)}
                    disabled={busyId === profile.id}
                    className="flex h-11 items-center gap-2 px-3 text-muted transition-colors hover:text-critical disabled:opacity-50"
                  >
                    <UserX size={16} />
                    {t('accounts.decline')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl">{t('manage.accounts')}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{t('accounts.mailNote')}</p>
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {approved.map((profile) => {
            const isSelf = profile.id === currentId;
            // The last administrator has nobody to restore them.
            const lastAdmin = profile.role === 'admin' && adminCount === 1;

            return (
              <li key={profile.id} className="flex flex-wrap items-center gap-3 py-3.5">
                <span className="min-w-[14rem] flex-1">
                  <span className="block font-medium">
                    {profile.full_name ?? profile.email}
                    {isSelf && <span className="ms-2 text-xs text-muted">you</span>}
                  </span>
                  <span className="machine block text-muted">{profile.email}</span>
                </span>

                <span
                  className={
                    profile.role === 'admin'
                      ? 'rounded-full border border-accent/40 bg-accent-wash px-3 py-1 font-mono text-xs text-accent'
                      : 'rounded-full border border-rule bg-paper-2 px-3 py-1 font-mono text-xs text-muted'
                  }
                >
                  {ROLE_LABELS[profile.role]}
                </span>

                {!isSelf && !lastAdmin && (
                  <select
                    value={profile.role}
                    onChange={(e) => setRole(profile, e.target.value as UserRole)}
                    disabled={busyId === profile.id}
                    aria-label={`Role for ${profile.email}`}
                    className="h-11 rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:outline-none disabled:opacity-50"
                  >
                    <option value="volunteer">{t('accounts.volunteer')}</option>
                    <option value="admin">{t('accounts.administrator')}</option>
                    <option value="pending">{t('accounts.suspend')}</option>
                  </select>
                )}

                {lastAdmin && (
                  <span className="text-xs text-muted">
                    {t('accounts.onlyAdmin')}
                  </span>
                )}

                <fieldset className="flex basis-full flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <legend className="sr-only">{t('accounts.mail')}</legend>
                  <span aria-hidden className="flex items-center gap-1.5 text-muted">
                    <Mail size={15} />
                    {t('accounts.mail')}
                  </span>
                  <label className="flex min-h-10 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(profile.notify_uploads)}
                      onChange={(e) => setNotice(profile, 'notifyUploads', e.target.checked)}
                      disabled={busyId === profile.id}
                      className="h-4 w-4 accent-[var(--color-primary)]"
                    />
                    {t('accounts.notifyUploads')}
                  </label>
                  {profile.role === 'admin' && (
                    <label className="flex min-h-10 cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(profile.notify_publications)}
                        onChange={(e) => setNotice(profile, 'notifyPublications', e.target.checked)}
                        disabled={busyId === profile.id}
                        className="h-4 w-4 accent-[var(--color-primary)]"
                      />
                      {t('accounts.notifyPublications')}
                    </label>
                  )}
                </fieldset>
              </li>
            );
          })}
        </ul>
      </section>

      {pending && <span className="sr-only">{t('common.saving')}</span>}
    </div>
  );
}
