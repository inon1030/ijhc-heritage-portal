import type { Mail } from './index';
import { reader, resolve } from '@/lib/i18n';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function recoveryMail(to: string, url: string, language: string): Mail {
  const t = reader(resolve(language));
  const subject = t('recovery.title');
  const text = `${t('recovery.mailBody')}\n\n${url}\n\n${t('recovery.mailIgnore')}`;
  return {
    to, subject, text,
    html: `<!doctype html><html lang="${language === 'he' ? 'he' : 'en'}" dir="${language === 'he' ? 'rtl' : 'ltr'}"><body style="background:#fff;color:#1f1d1a;font:18px/1.6 Arial,sans-serif"><main style="max-width:560px;margin:auto;padding:24px"><h1>${escape(subject)}</h1><p>${escape(t('recovery.mailBody'))}</p><p><a style="display:inline-block;padding:12px 20px;background:#8a3b12;color:#fff;border-radius:6px" href="${escape(url)}">${escape(t('recovery.choose'))}</a></p><p>${escape(t('recovery.mailIgnore'))}</p></main></body></html>`,
  };
}
