import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { FilePreview } from '@/components/file-preview';
import { TranslationRequest } from '@/components/translation-request';
import { CommunityMark } from '@/components/community-mark';
import { Field } from '@/components/primitives';
import { Reveal } from '@/components/reveal';
import { FIELD_GROUPS, GROUP_ORDER, fieldDef } from '@/lib/fields/registry';
import { getPublishedItem } from '@/lib/items/queries';
import { present } from '@/lib/translate/render';
import { listItemFamilies } from '@/lib/vocabulary/queries';
import { getMessages } from '@/lib/i18n';
import { categoryKey } from '@/lib/i18n/labels';
import { formatBytes, formatDate, formatDuration } from '@/lib/utils';

type Params = Promise<{ id: string }>;
type Search = Promise<{ original?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const item = await getPublishedItem(id).catch(() => null);
  if (!item) {
    const { t } = await getMessages();
    return { title: t('record.notFound') };
  }
  return {
    title: item.title,
    description: item.description ?? undefined,
  };
}

/**
 * The permanent record page the product outline calls for. It has its own URL,
 * so it can be cited, shared with a family, or linked from a paper. In the demo
 * this was a modal with no address.
 */
export default async function RecordPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { id } = await params;
  const item = await getPublishedItem(id);
  if (!item) notFound();

  const file = item.file;
  const families = await listItemFamilies(id);

  /*
   * The record in the reader's language, if they asked for one.
   *
   * `present` lays the translations over the record and says plainly what it
   * did; the page draws from `shown` and the note below says where the words
   * came from. `item` is untouched throughout — the file, the dimensions, the
   * keywords and the tree fields are the archive's own and are never
   * translated, and `?original=1` returns the record exactly as it was written.
   */
  const { original } = await searchParams;
  const reading = await present(item, { original: original === '1' });
  const { t } = await getMessages();
  const shown = reading.item;

  return (
    <article className="mx-auto max-w-5xl px-6 pt-6 pb-14 sm:pt-10 sm:pb-16">
      <Link
        href="/portal"
        className="mb-8 inline-flex h-11 items-center gap-2 rounded-full border border-rule px-4 text-muted transition-all duration-200 hover:-translate-x-0.5 hover:border-accent-strong hover:text-ink"
      >
        <ArrowLeft size={16} /> {t('record.backToPortal')}
      </Link>

      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="card animate-rise overflow-hidden rounded-2xl bg-paper-2 p-2">
            <div className="flex min-h-80 items-center justify-center overflow-hidden rounded-xl">
              <FilePreview file={file} alt={item.title} fit="contain" />
            </div>
          </div>

          {/* A record can be a document scanned page by page. Every page is
              part of the record, so every page is on the page. */}
          {item.files.length > 1 && (
            <ul className="mt-3 grid grid-cols-4 gap-2">
              {item.files.map((page, index) => (
                <li key={page.id} className="card card-interactive overflow-hidden bg-paper-2">
                  <div className="flex h-20 items-center justify-center overflow-hidden">
                    <FilePreview file={page} alt={`${item.title}, ${index + 1}`} fit="cover" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="eyebrow animate-rise">{t(categoryKey(item.category))}</p>
          <h1
            className="animate-rise mt-3 font-display text-3xl leading-tight sm:text-4xl"
            dir="auto"
            style={{ '--reveal-delay': '70ms' } as React.CSSProperties}
          >
            {shown.title}
          </h1>

          <div
            className="animate-rise mt-4"
            style={{ '--reveal-delay': '140ms' } as React.CSSProperties}
          >
            <CommunityMark community={item.community} />
          </div>

          {/*
            Where these words came from.
            A machine translation shown without saying so is the archive
            telling a reader that a family wrote something it did not write.
            The original is a link rather than a toggle, so it has an address:
            somebody citing this record can cite the words actually used.
          */}
          {reading.translated && (
            <p className="machine mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              {/* The language's own name, not the English one. "Translated
                  into Hebrew" set in Hebrew reads as half a sentence — the
                  reader is already in Hebrew, and the word for their language
                  is not an English word. */}
              <span>{t('translation.byMachine', { language: reading.language.label_native })}</span>
              <Link
                href={`/portal/${item.id}?original=1`}
                className="text-accent underline underline-offset-2 hover:text-accent-strong"
              >
                {t('translation.showOriginal')}
              </Link>
            </p>
          )}

          {reading.showingOriginal && (
            <p className="machine mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span>{t('translation.original')}</span>
              <Link
                href={`/portal/${item.id}`}
                className="text-accent underline underline-offset-2 hover:text-accent-strong"
              >
                {t('record.readItIn', { language: reading.language.label_native })}
              </Link>
            </p>
          )}

          {reading.wanted && (
            <TranslationRequest
              itemId={item.id}
              lang={reading.language.code}
              label={reading.language.label_native}
            />
          )}

          {families.length > 0 && (
            <p className="mt-3 flex flex-wrap gap-2">
              {families.map((family) => (
                <span
                  key={family.id}
                  className="rounded-full bg-turquoise-wash px-3.5 py-1.5 text-sm font-medium text-turquoise ring-1 ring-turquoise/20"
                >
                  {family.name}
                </span>
              ))}
            </p>
          )}

          {shown.description && (
            <p className="mt-7 leading-relaxed sm:text-lg" dir="auto">
              {shown.description}
            </p>
          )}

          {item.keywords.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2">
              {item.keywords.map((keyword) => (
                <li
                  key={keyword}
                  className="rounded-full border border-rule bg-paper-2 px-3.5 py-1.5 font-mono text-sm"
                >
                  {keyword}
                </li>
              ))}
            </ul>
          )}

          <Reveal className="mt-9">
          <dl className="card grid grid-cols-2 gap-x-6 gap-y-6 bg-paper-2/50 p-6">
            <Field label={t('record.provenance')}>
              {shown.provenance ?? <span className="text-muted italic">{t('record.notRecorded')}</span>}
            </Field>
            <Field label={t('record.contributor')}>
              {item.source ?? <span className="text-muted italic">{t('record.notRecorded')}</span>}
            </Field>
            {item.source_url && (
              <Field label={t('record.capturedFrom')} machine>
                {/* rel="noreferrer" and no target: an archive citation is a
                    citation, and it should not hand the source a referrer
                    header naming which record links to it. */}
                <a
                  href={item.source_url}
                  rel="noreferrer nofollow"
                  className="break-all text-accent underline underline-offset-2 hover:text-accent-strong"
                >
                  {item.source_url}
                </a>
              </Field>
            )}
            <Field label={t('record.period')}>
              {item.period ?? <span className="text-muted italic">{t('record.notRecorded')}</span>}
            </Field>
            <Field label={t('record.placeOfOrigin')}>
              {item.origin_place ?? <span className="text-muted italic">{t('record.notRecorded')}</span>}
            </Field>
            <Field label={t('record.language')}>
              {item.language ?? <span className="text-muted italic">{t('record.notRecorded')}</span>}
            </Field>
            <Field label={t('record.added')} machine>
              {formatDate(item.created_at)}
            </Field>

            {file && (
              <>
                <Field label={t('record.file')} machine>
                  {file.mime_type} · {formatBytes(file.byte_size)}
                </Field>
                <Field label={t('record.dimensions')} machine>
                  {file.width && file.height ? (
                    `${file.width} × ${file.height} px`
                  ) : file.duration_ms ? (
                    formatDuration(file.duration_ms)
                  ) : (
                    <span className="text-muted">{t('record.notMeasured')}</span>
                  )}
                </Field>
              </>
            )}
          </dl>
          </Reveal>

          {/* The rest of the catalogue. Only what a knowledge expert approved: nothing
              reaches this page until the record does, and the record does not
              move until a person has been through the fields one at a time.

              Two shapes, because the tree has two kinds of node. A branch the
              record is filed under is a tag — printing "Literature and Poetry"
              under a heading reading LITERATURE AND POETRY says it twice. A
              branch that holds an answer keeps its label, because "Alibag"
              alone means nothing. */}
          {item.fields.length > 0 && (
            <Reveal className="mt-6">
              <div className="card bg-paper-2/50 p-6">
                {GROUP_ORDER.map((group) => {
                  const rows = item.fields.filter((f) => fieldDef(f.field_key)?.group === group);
                  if (!rows.length) return null;

                  const filed = rows.filter((f) => fieldDef(f.field_key)?.type === 'facet');
                  const answered = rows.filter((f) => fieldDef(f.field_key)?.type !== 'facet');

                  return (
                    <section key={group} className="mb-6 last:mb-0">
                      <p className="eyebrow mb-2.5 border-b border-rule pb-1.5">
                        {FIELD_GROUPS[group].label}
                      </p>

                      {filed.length > 0 && (
                        <ul className="mb-4 flex flex-wrap gap-2 last:mb-0">
                          {filed.map((row) => (
                            <li
                              key={row.id}
                              className="rounded-full border border-rule bg-paper px-3.5 py-1.5 text-sm"
                            >
                              {row.value}
                            </li>
                          ))}
                        </ul>
                      )}

                      {answered.length > 0 && (
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                          {answered.map((row) => (
                            <Field key={row.id} label={fieldDef(row.field_key)!.label}>
                              {row.value}
                            </Field>
                          ))}
                        </dl>
                      )}
                    </section>
                  );
                })}
              </div>
            </Reveal>
          )}

          <p className="mt-8 text-xs leading-relaxed text-muted">
            {t('record.measuredNote')}
          </p>
        </div>
      </div>
    </article>
  );
}
