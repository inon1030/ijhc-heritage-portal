'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { useMessages } from '@/lib/i18n/provider';
import { createBrowserSupabase } from '@/lib/supabase/browser';

/**
 * Sign in, or ask for an account.
 *
 * Asking creates the account immediately and it is worth nothing until an
 * administrator approves it — `profiles.role` starts at 'pending'. Creating it
 * now rather than on approval is what keeps the password out of our hands: it
 * goes from this form to Supabase Auth and is never written anywhere we own.
 */

type Mode = 'sign-in' | 'request';

export function LoginForm() {
  const t = useMessages();
  const router = useRouter();
  const params = useSearchParams();
  // The top bar offers "Create an account" as its own entry, so the link has
  // to be able to land on that tab rather than on Sign in with a tab to find.
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'request' ? 'request' : 'sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    const supabase = createBrowserSupabase();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      // Deliberately vague: a precise message tells an attacker which half was right.
      setError(t('login.badCredentials'));
      setBusy(false);
      return;
    }

    const next = params.get('next') ?? '/review';
    router.push(next);
    router.refresh();
  }

  async function request() {
    const response = await fetch('/api/auth/request-account', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, fullName }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? t('login.requestFailed'));
      setBusy(false);
      return;
    }

    setRequested(true);
    setBusy(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    if (mode === 'sign-in') await signIn();
    else await request();
  }

  if (requested) {
    return (
      <div className="mt-8 card rounded-xl border-positive/30 bg-sage-wash px-5 py-6">
        <p className="flex items-center gap-2 font-display text-xl text-positive">
          <Check size={20} /> {t('login.requestIn')}
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          {t('login.requestInBody')} <span className="machine">{email}</span> before the review
          queue opens. You can sign in now — until then you will see the archive exactly as any
          visitor does.
        </p>
        <button
          type="button"
          onClick={() => {
            setRequested(false);
            setMode('sign-in');
          }}
          className="mt-5 underline underline-offset-4 hover:text-accent"
        >
          {t('login.signIn')}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="mt-8 flex gap-1 border-b border-rule" role="tablist">
        <ModeTab active={mode === 'sign-in'} onClick={() => setMode('sign-in')}>
          Sign in
        </ModeTab>
        <ModeTab active={mode === 'request'} onClick={() => setMode('request')}>
          {t('login.askForAccount')}
        </ModeTab>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === 'request' && (
          <label className="block">
            <span className="eyebrow mb-1.5 block">{t('login.yourName')}</span>
            <input
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={120}
              className="h-13 w-full rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:bg-accent-wash/30 focus:outline-none"
            />
          </label>
        )}

        <label className="block">
          <span className="eyebrow mb-1.5 block">{t('login.email')}</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-13 w-full rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:bg-accent-wash/30 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="eyebrow mb-1.5 block">{t('login.password')}</span>
          <input
            type="password"
            required
            minLength={mode === 'request' ? 10 : undefined}
            autoComplete={mode === 'request' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-13 w-full rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:bg-accent-wash/30 focus:outline-none"
          />
          {mode === 'request' && (
            <span className="mt-1.5 block text-xs text-muted">{t('login.passwordHint')}</span>
          )}
        </label>

        {error && (
          <p role="alert" className="rounded-lg border-s-[3px] border-critical bg-critical/8 px-3 py-2 text-sm text-critical">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink font-medium text-paper shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-ink-2 hover:shadow-lift disabled:pointer-events-none disabled:opacity-60"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {mode === 'sign-in' ? (busy ? t('login.signingIn') : 'Sign in') : busy ? t('login.sending') : t('login.sendRequest')}
        </button>

        <p className="text-sm leading-relaxed text-muted">
          {mode === 'sign-in'
            ? t('login.noAccountNeeded')
            : t('login.approvalNote')}
        </p>
      </form>
    </>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        'flex h-12 items-center px-4 transition-colors',
        active
          ? 'border-b-2 border-accent font-medium text-ink'
          : 'border-b-2 border-transparent text-muted hover:text-ink',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
