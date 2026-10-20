'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMessages } from '@/lib/i18n/provider';

export function PasswordRecoveryForm({ reset = false, tokenHash }: { reset?: boolean; tokenHash?: string }) {
  const t = useMessages();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [invalid, setInvalid] = useState(reset && !tokenHash);
  const [sent, setSent] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    if (reset && data.get('password') !== data.get('confirmation')) {
      setMessage(t('recovery.mismatch')); return;
    }
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/auth/${reset ? 'reset' : 'forgot'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reset ? { tokenHash, password: data.get('password'), confirmation: data.get('confirmation') } : { email: data.get('email') }),
      });
      const body = await response.json();
      if (!response.ok) {
        setInvalid(body.error?.code === 'expired_link');
        setMessage(body.error?.message ?? t('recovery.retry')); return;
      }
      if (reset) { router.push('/'); router.refresh(); }
      else { setSent(true); setMessage(t('recovery.neutral')); }
    } catch { setMessage(t('recovery.retry')); }
    finally { setBusy(false); }
  }
  const inputClass = 'h-12 w-full rounded-lg border border-rule bg-paper px-4 focus:outline-2 focus:outline-accent';
  return <div className="mx-auto max-w-md px-6 py-16">
    <h1 className="font-display text-3xl">{t(reset ? 'recovery.choose' : 'recovery.title')}</h1>
    {invalid || (reset && !tokenHash) ? <div className="mt-6 space-y-4">
      <p role="alert">{message || t('recovery.invalid')}</p>
      <Link className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 py-3 font-medium text-white hover:bg-primary-strong focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50" href="/login/forgot">{t('recovery.requestNew')}</Link>
    </div> : <form onSubmit={submit} className="mt-6 space-y-5">
      {!reset && !sent && <label className="block"><span className="mb-2 block">{t('login.email')}</span><input className={inputClass} dir="ltr" name="email" type="email" required maxLength={160} autoComplete="email" /></label>}
      {reset && <>
        <p id="password-hint" className="text-muted">{t('recovery.passwordHint')}</p>
        <label className="block"><span className="mb-2 block">{t('login.password')}</span><input className={inputClass} name="password" type="password" minLength={10} maxLength={200} required autoComplete="new-password" aria-describedby="password-hint" /></label>
        <label className="block"><span className="mb-2 block">{t('recovery.confirm')}</span><input className={inputClass} name="confirmation" type="password" minLength={10} maxLength={200} required autoComplete="new-password" /></label>
      </>}
      {message && <p role="status" className="break-words">{message}</p>}
      {!sent && <button className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 py-3 font-medium text-white hover:bg-primary-strong focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 w-full" disabled={busy}>{t(busy ? 'recovery.busy' : reset ? 'recovery.save' : 'recovery.send')}</button>}
    </form>}
    <Link href="/login" className="mt-5 inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">{t('recovery.back')}</Link>
  </div>;
}
