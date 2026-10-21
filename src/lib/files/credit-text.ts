import { en, format, type MessageKey } from '@/lib/i18n/messages';

type Translator = (key: MessageKey, vars?: Record<string, string | number>) => string;
const english: Translator = (key, vars) => format(en[key], vars);

export function creditName(value: string | null | undefined, limit?: number): string {
  // Control characters must not introduce lines or override the surrounding bidi text.
  const clean = (value ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
  const letters = Array.from(clean);
  return limit && letters.length > limit ? letters.slice(0, limit - 1).join('') + '…' : clean;
}

export function creditText(collector?: string | null, source?: string | null, t: Translator = english, limit?: number): string {
  const owner = creditName(collector, limit);
  const uploader = creditName(source, limit);
  return [
    owner && t('credit.collection', { collector: owner }),
    uploader && t('credit.shared', { source: uploader }),
    t(owner ? 'credit.center' : 'credit.centerCopyright'),
  ].filter(Boolean).join(' · ');
}

export function escapePango(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
