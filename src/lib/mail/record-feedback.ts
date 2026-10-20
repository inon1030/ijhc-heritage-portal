import 'server-only';
import { readFeedbackRecipients } from '@/lib/items/queries';
import type { Item } from '@/lib/types';
import type { CorrectionChanges } from '@/lib/items/public-input';
import { siteUrl } from '@/lib/site';
import { sendMail } from './index';
import { recordFeedbackMail } from './templates';

export async function notifyRecordFeedback(item: Item, kind: 'comment' | 'correction', body: string,
  changes: CorrectionChanges | undefined, correctionId: string, token?: string) {
  const recipients = await readFeedbackRecipients(item);
  for (const recipient of recipients) {
    await sendMail(recordFeedbackMail({
      to: recipient.email, language: recipient.language, title: item.title, kind, body, changes,
      publicUrl: `${siteUrl()}/portal/${item.id}`,
      objectionUrl: recipient.uploader && token
        ? `${siteUrl()}/corrections/${correctionId}/objection?t=${encodeURIComponent(token)}` : undefined,
    }));
  }
}
