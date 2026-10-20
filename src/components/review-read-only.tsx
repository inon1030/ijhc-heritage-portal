import { FilePreview } from './file-preview';
import { getMessages } from '@/lib/i18n';
import type { ItemDetail } from '@/lib/types';

export async function ReviewReadOnly({ item }: { item: ItemDetail }) {
  const { t } = await getMessages();
  return <section className="space-y-6">
    <p role="status" className="rounded-xl border border-rule bg-paper-2 p-4">{t('review3.readOnly')}</p>
    <h1 className="break-words font-display text-3xl" dir="auto">{item.title}</h1>
    <p className="whitespace-pre-wrap break-words" dir="auto">{item.description}</p>
    <p dir="auto">{item.keywords.join(', ')}</p>
    <dl className="grid gap-4 sm:grid-cols-2">{item.fields.map(field => <div key={field.id}><dt>{field.field_key}</dt><dd dir="auto">{field.value}</dd></div>)}</dl>
    {item.files.map(file => <div key={file.id} className="overflow-hidden rounded-xl border border-rule"><FilePreview file={file} alt={item.title} fit="contain" /></div>)}
  </section>;
}
