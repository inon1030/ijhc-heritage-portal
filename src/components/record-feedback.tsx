'use client';
import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buttonClass } from './primitives';
import { useMessages } from '@/lib/i18n/provider';
import type { CorrectionField } from '@/lib/items/public-input';
import type { PublicComment } from '@/lib/items/queries';

const inputClass = 'min-h-11 w-full min-w-0 rounded-lg border border-rule bg-paper px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent-strong';

export function RecordFeedback({ itemId, token, fields, comments, expert, locale = 'en' }: {
  itemId: string; token: string; fields: CorrectionField[]; comments: PublicComment[]; expert: boolean; locale?: string;
}) {
  const t = useMessages();
  return <section className="mt-12 border-t border-rule pt-8">
    <h2 className="font-display text-2xl">{t('public.comments')}</h2>
    {!comments.length && <p className="mt-4 text-muted">{t('public.empty')}</p>}
    <ul className="mt-4 space-y-5">
      {comments.map(comment => <li key={comment.id} className="min-w-0 border-b border-rule pb-5">
        <p className="flex flex-wrap gap-x-3 gap-y-1">
          <strong dir="auto">{comment.anonymous ? t('public.anonymous') : comment.author_name}</strong>
          <time dateTime={comment.created_at} className="text-muted">{new Date(comment.created_at).toLocaleDateString(locale, { timeZone: 'UTC' })}</time>
          {comment.hidden_at && <span>{t('public.hidden')}</span>}
        </p>
        <p dir="auto" className="mt-2 whitespace-pre-wrap break-words">{comment.body}</p>
        {expert && <CommentVisibility itemId={itemId} comment={comment} />}
      </li>)}
    </ul>
    <FeedbackForm itemId={itemId} token={token} />
    <details className="mt-8 rounded-xl border border-rule p-4">
      <summary className="min-h-11 cursor-pointer py-2 font-medium focus-visible:outline-2">{t('public.correction')}</summary>
      <p className="my-4 text-muted">{t('public.correctionHint')}</p>
      <FeedbackForm itemId={itemId} token={token} fields={fields} />
    </details>
  </section>;
}

function FeedbackForm({ itemId, token, fields }: { itemId: string; token: string; fields?: CorrectionField[] }) {
  const t = useMessages();
  const router = useRouter();
  const prefix = useId();
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const submitting = useRef(false);
  return <form className="mt-6 space-y-4" onSubmit={async event => {
    event.preventDefault();
    if (submitting.current || sent) return;
    submitting.current = true;
    setBusy(true); setMessage('');
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      const response = await fetch(`/api/records/${itemId}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, anonymous, name: values.get('name') ?? '', email: values.get('email') ?? '',
          website: values.get('website'), body: values.get('body'),
          ...(fields ? {
            values: Object.fromEntries(fields.filter(field => String(values.get(field.key) ?? '').trim() !== field.value)
              .map(field => [field.key, values.get(field.key)])),
            originals: Object.fromEntries(fields.map(field => [field.key, field.value])),
          } : {}) }) });
      const result = await response.json();
      if (!result.ok) { setMessage(result.error.message); return; }
      setSent(true); setMessage(t(fields ? 'public.proposed' : 'public.saved'));
      router.refresh();
    } catch { setMessage(t('public.failed')); }
    finally { submitting.current = false; setBusy(false); }
  }}>
    <fieldset disabled={busy || sent} className="min-w-0 space-y-4">
      <legend className="mb-3 font-medium">{t(fields ? 'public.correction' : 'public.comment')}</legend>
      {fields?.map(field => <label key={field.key} className="block">
        <span className="mb-2 block">{field.label}</span>
        {field.options ? <select name={field.key} defaultValue={field.value} className={inputClass}>
          <option value="">{t('public.none')}</option>
          {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select> : <textarea name={field.key} defaultValue={field.value} dir="auto" rows={field.key === 'description' ? 5 : 2}
          required={field.key === 'title'} maxLength={field.maxLength} className={inputClass} />}
      </label>)}
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} className="h-5 w-5" />{t('public.anonymous')}
      </label>
      {!anonymous && <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="block"><span className="mb-2 block">{t('public.name')}</span>
          <input name="name" autoComplete="name" required minLength={2} maxLength={120} dir="auto" className={inputClass} /></label>
        <label className="block"><span className="mb-2 block">{t('public.email')}</span>
          <input name="email" type="email" autoComplete="email" required maxLength={254} dir="ltr" className={inputClass} /></label>
      </div>}
      <div hidden aria-hidden="true"><label htmlFor={`${prefix}-website`}>{t('public.website')}</label>
        <input id={`${prefix}-website`} name="website" tabIndex={-1} autoComplete="off" /></div>
      <label className="block"><span className="mb-2 block">{t(fields ? 'public.note' : 'public.body')}</span>
        <textarea name="body" required={!fields} maxLength={2000} rows={4} dir="auto" className={inputClass} /></label>
      <button type="submit" className={buttonClass('accent')}>{t(busy ? 'public.sending' : 'public.submit')}</button>
    </fieldset>
    <p role="status" aria-live="polite" className="break-words">{message}</p>
  </form>;
}

function CommentVisibility({ itemId, comment }: { itemId: string; comment: PublicComment }) {
  const t = useMessages();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="mt-3">
    <button type="button" disabled={busy} className={buttonClass('quiet')} onClick={async () => {
      setBusy(true); setError('');
      try {
        const response = await fetch(`/api/records/${itemId}/moderation`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commentId: comment.id, hidden: !comment.hidden_at }) });
        const result = await response.json();
        if (!result.ok) setError(result.error.message); else router.refresh();
      } catch { setError(t('public.failed')); }
      finally { setBusy(false); }
    }}>{t(comment.hidden_at ? 'public.unhide' : 'public.hide')}</button>
    <p role="status">{error}</p>
  </div>;
}
