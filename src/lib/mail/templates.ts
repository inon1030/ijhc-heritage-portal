import type { Mail } from './index';

/**
 * The two messages the archive sends a contributor.
 *
 * Both are in Hebrew and English together. The archive does not keep the
 * language a contributor used — the published notice goes out days later, from
 * a Moderator's session — and a Hebrew-only note to a contributor in Kochi is
 * as useless as an English-only one to a grandmother in Be'er Sheva.
 *
 * The title is the contributor's own words, so it is escaped before it goes
 * into HTML: a title is a string a stranger typed.
 */

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shell(he: string, en: string): string {
  return [
    '<!doctype html><html><body style="margin:0;background:#ffffff;color:#1f1d1a;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6">',
    '<div style="max-width:560px;margin:0 auto;padding:24px 16px">',
    `<div dir="rtl" lang="he" style="text-align:right">${he}</div>`,
    '<hr style="border:none;border-top:1px solid #ddd6cc;margin:24px 0">',
    `<div dir="ltr" lang="en" style="text-align:left">${en}</div>`,
    '<p style="margin-top:32px;font-size:13px;color:#6b645a">IJHC · Indian Jewish Heritage Center</p>',
    '</div></body></html>',
  ].join('');
}

function button(href: string, label: string): string {
  return `<p><a href="${escape(href)}" style="display:inline-block;background:#8a3b12;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px">${label}</a></p>`;
}

/** Sent the moment a submission is saved. The receipt link is the way back to it. */
export function receiptMail(to: string, title: string, receiptUrl: string): Mail {
  const t = escape(title);
  return {
    to,
    subject: 'קיבלנו את הפריט ששלחת · We received your item',
    text: [
      `תודה. קיבלנו את "${title}" והוא ממתין לבדיקה של מומחה.`,
      `בקישור הזה אפשר לראות מה קרה איתו: ${receiptUrl}`,
      '',
      `Thank you. We received "${title}" and it is waiting for a Moderator to review it.`,
      `This link shows what happened to it: ${receiptUrl}`,
    ].join('\n'),
    html: shell(
      `<p>תודה. קיבלנו את <strong>${t}</strong> והוא ממתין לבדיקה של מומחה.</p><p>בקישור הזה אפשר לראות מה קרה איתו, בכל זמן:</p>${button(receiptUrl, 'מה קרה עם הפריט')}`,
      `<p>Thank you. We received <strong>${t}</strong> and it is waiting for a Moderator to review it.</p><p>This link shows what happened to it, at any time:</p>${button(receiptUrl, 'Where my item is')}`,
    ),
  };
}

/** Sent when a Moderator publishes the record. The public link is the one to share. */
export function publishedMail(to: string, title: string, publicUrl: string): Mail {
  const t = escape(title);
  return {
    to,
    subject: 'הפריט ששלחת פורסם בארכיון · Your item is now in the archive',
    text: [
      `"${title}" פורסם בארכיון המורשת של יהדות הודו.`,
      `זה הקישור לשתף עם המשפחה והחברים: ${publicUrl}`,
      '',
      `"${title}" is now published in the Indian Jewish Heritage archive.`,
      `This is the link to share with family and friends: ${publicUrl}`,
    ].join('\n'),
    html: shell(
      `<p><strong>${t}</strong> פורסם בארכיון המורשת של יהדות הודו.</p><p>זה הקישור לשתף עם המשפחה והחברים:</p>${button(publicUrl, 'לפריט בארכיון')}`,
      `<p><strong>${t}</strong> is now published in the Indian Jewish Heritage archive.</p><p>This is the link to share with family and friends:</p>${button(publicUrl, 'See it in the archive')}`,
    ),
  };
}
