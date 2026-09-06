'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useMessages } from '@/lib/i18n/provider';
import { Loader2, ShieldCheck, UserCheck, UserX } from 'lucide-react';
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
      setError(body?.error?.message ?? 'That did not go through. Try again.');
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
    <div className="max-w-4xl space-y-10">
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
          <p className="mt-4 rounded-xl border border-dashed border-rule-strong bg-paper-2/60 px-6 py-8 text-center text-muted">
            {t('accounts.nobodyWaiting')}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {waiting.map((profile) => (
              <li key={profile.id} className="flex flex-wrap items-center gap-3 py-4">
                <span className="min-w-[14rem] flex-1">
                  <span className="block font-medium">{profile.full_name ?? 'No name given'}</span>
                  <span className="machine block text-muted">{profile.email}</span>
                  <span className="text-xs text-muted">Asked {formatDate(profile.created_at)}</span>
                </span>

                <button
                  type="button"
                  onClick={() => setRole(profile, 'volunteer')}
                  disabled={busyId === profile.id}
                  className="flex h-11 items-center gap-2 bg-ink px-4 font-medium text-paper transition-colors hover:bg-ink-2 disabled:opacity-50"
                >
                  {busyId === profile.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <UserCheck size={16} />
                  )}
                  Approve as volunteer
                </button>

                <button
                  type="button"
                  onClick={() => setRole(profile, 'admin')}
                  disabled={busyId === profile.id}
                  className="flex h-13 items-center gap-2 rounded-full border border-accent px-5 font-medium text-accent transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent-wash disabled:opacity-50"
                >
                  <ShieldCheck size={16} />
                  {t('accounts.asAdministrator')}
                </button>

                {confirming === profile.id ? (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => decline(profile)}
                      className="h-13 rounded-full bg-critical px-5 font-medium text-paper transition-transform duration-200 hover:-translate-y-0.5"
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
                    className="h-13 rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:outline-none disabled:opacity-50"
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
              </li>
            );
          })}
        </ul>
      </section>

      {pending && <span className="sr-only">{t('common.saving')}</span>}
    </div>
  );
}
