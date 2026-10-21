'use client';
import { TagPicker } from './tag-picker';
import { CollectorCreditEditor } from '@/components/collector-credit-editor';

import { ReviewReadingDraft } from '@/components/review-draft-scope';
import { ReviewDraftControls } from '@/components/review-draft-controls';
import { ReviewCandidates } from '@/components/review-candidates';
import { useState } from 'react';
import { ReviewServerActions } from '@/components/review-server-actions';
import { useRouter } from 'next/navigation';
import { useMessages } from '@/lib/i18n/provider';
import { communityKey } from '@/lib/i18n/labels';
import { ArrowLeft, Check, EyeOff, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import { BackgroundNote } from '@/components/background-note';
import { DescriptionOrigin } from '@/components/description-origin';
import { EvidenceLedger } from '@/components/evidence-ledger';
import { FieldSheet } from '@/components/field-sheet';
import { FilePreview } from '@/components/file-preview';
import { SimulatedNotice, StatusPill } from '@/components/primitives';
import { TranslationDeck } from '@/components/translation-deck';
import { ACCESS_OPTIONS, accessOption } from '@/lib/access';
import { COMMUNITY_COLORS } from '@/lib/communities';
import { fieldDef, type FieldColumn, type FieldValue } from '@/lib/fields/registry';
import { needsCategory } from '@/lib/items/review-order';
import { allowedTransitions } from '@/lib/items/status';
import {
  type AccessLevel,
  CATEGORIES,
  CATEGORY_LABELS,
  categoryLabel,
  COMMUNITIES,
  COMMUNITY_LABELS,
  type Community,
  type Family,
  type ItemCategory,
  type ItemDetail,
  type ItemFile,
  type ItemStatus,
} from '@/lib/types';
import { type VocabularyTerm } from '@/lib/vocabulary/thesaurus';
import { cn, formatBytes, formatDuration } from '@/lib/utils';
import { backgroundOf } from '@/lib/ai/background';
import { contributorTextOf } from '@/lib/ai/replace-text';

function ContributorCorrections({ raw }: { raw: unknown }) {
  const t = useMessages();
  const text = contributorTextOf(raw);
  if (!text) return null;
  return <section className="mt-4 rounded-xl border border-rule bg-paper p-4">
    <h3 className="font-medium">{t('replace.contributorText')}</h3>
    <p dir="auto" className="mt-2 whitespace-pre-wrap">{text.summary}</p>
    {text.keywords.length > 0 && <p dir="auto" className="mt-2">{text.keywords.join(', ')}</p>}
    <BackgroundNote background={text.background ? { text: text.background, sources: text.backgroundSources } : null} />
  </section>;
}

/**
 * The verification workbench.
 *
 * Two panes: the original on the left, the record being written on the right.
 * Machine suggestions sit beside the fields they belong to with a single
 * control to adopt them, so accepting AI output is an explicit act per field
 * rather than an invisible default. The demo pre-filled the description from
 * the AI summary and gave the reviewer no way to see what had been changed.
 */
export function ReviewWorkbench({
  item,
  vocabulary,
  families,
  selectedFamilyIds,
  siteLanguage,
}: {
  item: ItemDetail;
  /** The language this review is being done in. See `TranslationDeck`. */
  siteLanguage: string;
  /** The only terms a record may carry, with their variants. Managed at /manage/vocabulary. */
  vocabulary: VocabularyTerm[];
  families: Family[];
  selectedFamilyIds: string[];
}) {
  const t = useMessages();
  const router = useRouter();
  const analysis = item.analysis;
  const simulated = analysis?.provider === 'mock';

  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');
  const [category, setCategory] = useState<ItemCategory | ''>(item.category ?? '');
  const [community, setCommunity] = useState<Community | ''>(item.community ?? '');
  const [provenance, setProvenance] = useState(item.provenance ?? '');
  const [language, setLanguage] = useState(item.language ?? '');
  const [period, setPeriod] = useState(item.period ?? '');
  const [originPlace, setOriginPlace] = useState(item.origin_place ?? '');
  const [keywords, setKeywords] = useState<string[]>(item.keywords);
  const [familyIds, setFamilyIds] = useState<string[]>(selectedFamilyIds);
  const [access, setAccess] = useState<AccessLevel>(item.access);
  const [fields, setFields] = useState<FieldValue[]>(() =>
    item.fields
      .filter((f) => !fieldDef(f.field_key)?.column)
      .map((f) => ({
        key: f.field_key,
        value: f.value,
        source: f.source,
        basis: f.basis,
        note: f.note,
      })),
  );

  /*
   * What the contributor corrected.
   *
   * A row here exists only because a person overrode what the machine read on
   * one of the six fields that have their own control on this screen — see
   * writeFields. It is their claim and it is not the record, so it is shown
   * beside the controls with a button rather than filled into them: the person
   * holding the original is usually right, and "usually" is not the same as
   * "automatically".
   */
  const corrections = item.fields.filter((f) => fieldDef(f.field_key)?.column);
  const [showing, setShowing] = useState(0);
  const [busy, setBusy] = useState<ItemStatus | 'delete' | null>(null);
  const [tagsBusy, setTagsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transitions = allowedTransitions(item.status);
  const shown: ItemFile | null = item.files[showing] ?? item.file;

  // Only terms offered for the chosen community, plus the global ones. The
  // list narrows as soon as a reviewer picks a stream, which is the point.
  const offered = vocabulary;
  const offeredFamilies = community ? families.filter((f) => f.community === community) : [];

  async function decide(status: ItemStatus) {
    if (needsCategory(status, category)) { setError(t('wb.categoryRequired')); return; }
    setBusy(status);
    setError(null);

    try {
      const res = await fetch(`/api/items/${item.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          title: title.trim(),
          category: category || null,
          description: description.trim() || null,
          community: community || null,
          provenance: provenance.trim() || null,
          keywords,
          language: language.trim() || null,
          period: period.trim() || null,
          originPlace: originPlace.trim() || null,
          familyIds,
          access,
          fields: fields
            .filter((f) => f.value.trim().length > 0)
            .map((f) => ({ key: f.key, value: f.value.trim() })),
        }),
      });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error.message);

      router.push('/review');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.decisionNotSaved'));
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm(t('wb.moveToBinConfirm', { title: item.title }))) return;
    setBusy('delete');
    setError(null);

    try {
      const res = await fetch(`/api/items/${item.id}/review`, { method: 'DELETE' });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error.message);

      router.push('/review');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.notDeleted'));
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <ReviewServerActions itemId={item.id} />
      <CollectorCreditEditor itemId={item.id} initialName={item.collector_name} initialRequired={item.collector_credit_required} />
      {/* The original */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow">{t('wb.original')}</h2>
          <StatusPill status={item.status} />
        </div>

        {/* Where it was captured from, above the file rather than buried in the
            metadata: for a captured page the address *is* the provenance, and
            a reviewer should be able to open the source before reading a word
            of what the archive made of it. */}
        {item.source_url && (
          <p className="mb-3 rounded-lg border-s-[3px] border-cochin bg-turquoise-wash/60 px-3 py-2 text-sm">
            <span className="eyebrow me-2">{t('wb.capturedFrom')}</span>
            <a
              href={item.source_url}
              target="_blank"
              rel="noreferrer nofollow"
              className="machine break-all underline underline-offset-2 hover:text-accent"
            >
              {item.source_url}
            </a>
          </p>
        )}

        <div className="flex min-h-96 items-center justify-center border border-rule bg-paper-2">
          <FilePreview file={shown} alt={item.title} fit="contain" />
        </div>

        {/* One record can hold several files — pages of a document, sides of an
            object. The reviewer needs to see all of them, not only the cover. */}
        {item.files.length > 1 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {item.files.map((file, index) => (
              <li key={file.id}>
                <button
                  type="button"
                  onClick={() => setShowing(index)}
                  aria-pressed={index === showing}
                  className={cn(
                    'h-16 w-16 overflow-hidden border transition-colors',
                    index === showing ? 'border-accent ring-2 ring-accent/30' : 'border-rule hover:border-accent',
                  )}
                >
                  <FilePreview file={file} alt={`Page ${index + 1}`} fit="cover" still />
                  <span className="sr-only">
                    Show {file.file_name}, file {index + 1} of {item.files.length}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {shown && (
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 card bg-paper-2/50 p-5">
            <Fact label={t('wb.fileName')}>{shown.file_name}</Fact>
            <Fact label={t('wb.type')}>{shown.mime_type}</Fact>
            <Fact label={t('wb.size')}>{formatBytes(shown.byte_size)}</Fact>
            <Fact label={t('wb.dimensions')}>
              {shown.width && shown.height
                ? `${shown.width} × ${shown.height} px`
                : shown.duration_ms
                  ? formatDuration(shown.duration_ms)
                  : 'not measured'}
            </Fact>
          </dl>
        )}

        <p className="mt-3 text-xs leading-relaxed text-muted">
          {t('wb.measured')}
        </p>

        {analysis?.ocr_text && (
          <ReadingEditor
            itemId={item.id}
            analysisId={analysis.id}
            label={t('wb.textRead')}
            machine={analysis.ocr_text}
            corrected={analysis.ocr_text_corrected}
            other={{ transcript: analysis.transcript_corrected }}
            field="ocrText"
            correctedBy={analysis.corrected_by}
          />
        )}

        {analysis?.transcript && (
          <ReadingEditor
            itemId={item.id}
            analysisId={analysis.id}
            label={t('wb.transcript')}
            machine={analysis.transcript}
            corrected={analysis.transcript_corrected}
            other={{ ocrText: analysis.ocr_text_corrected }}
            field="transcript"
            correctedBy={analysis.corrected_by}
          />
        )}

        <BackgroundNote background={backgroundOf(analysis?.raw)} />
        <ContributorCorrections raw={analysis?.raw} />
      </div>

      {/* The record */}
      <div>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="eyebrow">{t('wb.theRecord')}</h2>
          <span className="eyebrow text-end">
            {categoryLabel(item.category)}
            {/* Named up here as well as in the control below, because "who can
                see this" is the one decision on the screen a reviewer can make
                by accident and not notice. */}
            {access !== 'public' && (
              <span className="text-caution"> · {accessOption(access).label} only</span>
            )}
          </span>
        </div>

        {(item.contributor_description ||
          item.contributor_keywords.length > 0 ||
          item.contributor ||
          corrections.length > 0 ||
          item.consent_version) && (
          <section className="mb-5 rounded-lg border-s-[3px] border-cochin bg-turquoise-wash/60 px-4 py-3.5">
            <p className="eyebrow mb-1.5">{t('wb.contributorSaid')}</p>
            {analysis?.user_rating ? (
              <p className="mb-2 text-sm text-muted">
                {t('wb.userRating', { n: analysis.user_rating })}
              </p>
            ) : null}
            {item.contributor_description && (
              <DescriptionOrigin person={item.contributor_description} machine={analysis?.summary} />
            )}
            {item.contributor_keywords.length > 0 && (
              <p className="mt-2 flex flex-wrap gap-1.5">
                {item.contributor_keywords.map((term) => (
                  <span key={term} className="rounded-full border border-rule bg-paper px-2.5 py-1 text-sm">
                    {term}
                  </span>
                ))}
              </p>
            )}
            {corrections.length > 0 && (
              <div className="mt-3 border-t border-rule pt-3">
                <p className="eyebrow mb-2">{t('wb.theyCorrected')}</p>
                <ul className="space-y-1.5">
                  {corrections.map((row) => {
                    const adopt = ADOPTERS[fieldDef(row.field_key)!.column!];
                    return (
                      <li key={row.id} className="flex items-center justify-between gap-3">
                        <span className="text-sm">
                          <span className="text-muted">{fieldDef(row.field_key)!.label}: </span>
                          {row.value}
                        </span>
                        <button
                          type="button"
                          onClick={() => adopt({ setCategory, setCommunity, setLanguage, setPeriod, setOriginPlace, setProvenance }, row.value)}
                          className="shrink-0 rounded-full border border-rule bg-paper px-3 py-1 text-xs transition-colors hover:border-accent-strong hover:bg-accent-wash"
                        >
                          {t('wb.useThis')}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/*
                Who sent it.

                The address, the name they gave, how much else they have sent,
                and the families a knowledge expert has tied that address to. The
                families are the working part: a surname on a photograph is a
                guess, and an address already recorded against the Sassoons is
                something the archive established. Linking and unlinking is done
                on the families page, which is the same table read from the
                other side.
            */}
            {item.contributor && (
              <div className="mt-3 border-t border-rule pt-2.5">
                <p className="machine text-sm text-muted">
                  {item.contributor.email}
                  {item.contributor.full_name && <> · {item.contributor.full_name}</>}
                  {item.contributor.submissions > 1 && (
                    <> · {item.contributor.submissions} records</>
                  )}
                </p>
                {item.contributor.families.length > 0 && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-sm text-muted">{t('wb.knownFamily')}</span>
                    {item.contributor.families.map((family) => (
                      <span
                        key={family.id}
                        className="rounded-full border border-rule bg-paper px-2.5 py-0.5 text-sm"
                      >
                        {family.name}
                      </span>
                    ))}
                  </p>
                )}
                <a
                  href="/manage/families"
                  className="mt-1.5 inline-block text-sm text-muted underline underline-offset-2 hover:text-accent"
                >
                  {item.contributor.families.length > 0 ? 'Change' : 'Link'} this address to a family
                </a>
              </div>
            )}
            {item.consent_version && (
              <p className="machine mt-1 text-muted">
                Agreed to the{' '}
                <a href="/handling" className="underline underline-offset-2 hover:text-accent">
                  handling terms
                </a>{' '}
                v{item.consent_version}
              </p>
            )}
          </section>
        )}

        {/* Said first, because it changes what the rest of the screen is for.
            The clause is shown rather than the verdict: a knowledge expert can agree
            or disagree with "a festival in Cusco, Peru" at a glance, and the
            model is wrong about faded and cropped items often enough that this
            has to read as a question. */}
        {analysis?.off_topic && !simulated && (
          <section className="mb-5 rounded-lg border-s-[3px] border-caution bg-accent-wash px-4 py-3.5">
            <p className="eyebrow mb-1">{t('wb.mayNotBelong')}</p>
            {analysis.off_topic_reason && (
              <p className="machine leading-relaxed text-ink-2">{analysis.off_topic_reason}</p>
            )}
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              A suggestion, not a decision. Reject it below, or catalogue it like any other record
              if the archive read it wrongly.
            </p>
          </section>
        )}

        {simulated && <SimulatedNotice label={t('common.simulated')} className="mb-5" />}
        {analysis?.status === 'pending' && (
          <p role="status" className="mb-5 rounded-lg border-s-[3px] border-rule-strong bg-paper-2 px-3 py-2 text-xs text-muted">
            {t('wb.readingPending')}
          </p>
        )}
        {analysis?.status === 'failed' && !simulated && (
          <p className="mb-5 rounded-lg border-s-[3px] border-caution bg-accent-wash px-3 py-2 text-xs text-caution">
            {t('wb.noAnalysis')}
          </p>
        )}

        <div className="space-y-5">
          <FieldRow label={t('wb.title')}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="w-full rounded-lg border border-rule bg-paper px-4 py-3 focus:border-accent-strong focus:outline-none"
            />
          </FieldRow>

          <FieldRow
            label={t('wb.description')}
            suggestion={analysis?.summary ?? undefined}
            onAdopt={() => setDescription(analysis?.summary ?? '')}
            adopted={description === analysis?.summary}
          >
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder={t('wb.descriptionHint')}
              className="w-full resize-y rounded-lg border border-rule bg-paper px-4 py-3 text-sm focus:border-accent-strong focus:outline-none"
            />
          </FieldRow>

          <FieldRow
            label={t('wb.kind')}
            suggestion={
              analysis?.suggested_category ? CATEGORY_LABELS[analysis.suggested_category] : undefined
            }
            onAdopt={() => setCategory(analysis?.suggested_category ?? '')}
            adopted={Boolean(analysis?.suggested_category) && category === analysis?.suggested_category}
          >
            {/* The contribution screen used to ask the contributor this before
                anything else. It is a cataloguing decision, so it lives here. */}
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ItemCategory | '')}
              className="w-full rounded-lg border border-rule bg-paper px-4 py-3 focus:border-accent-strong focus:outline-none"
            >
              <option value="">{t('wb.notCatalogued')}</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </FieldRow>

          <FieldRow
            label={t('wb.community')}
            suggestion={
              analysis?.suggested_community
                ? COMMUNITY_LABELS[analysis.suggested_community]
                : undefined
            }
            onAdopt={() => setCommunity(analysis?.suggested_community ?? '')}
            adopted={
              Boolean(analysis?.suggested_community) && community === analysis?.suggested_community
            }
          >
            <select
              value={community}
              onChange={(e) => setCommunity(e.target.value as Community | '')}
              className="w-full rounded-lg border border-rule bg-paper px-4 py-3 focus:border-accent-strong focus:outline-none"
            >
              <option value="">{t('wb.notIdentified')}</option>
              {COMMUNITIES.map((c) => (
                <option key={c} value={c}>
                  {COMMUNITY_LABELS[c]}
                </option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label={t('wb.provenance')}>
            <input
              value={provenance}
              onChange={(e) => setProvenance(e.target.value)}
              maxLength={2000}
              placeholder={t('wb.provenanceHint')}
              className="w-full rounded-lg border border-rule bg-paper px-4 py-3 focus:border-accent-strong focus:outline-none"
            />
          </FieldRow>

          <FieldRow
            label={t('wb.language')}
            suggestion={analysis?.language ?? undefined}
            onAdopt={() => setLanguage(analysis?.language ?? '')}
            adopted={Boolean(analysis?.language) && language === analysis?.language}
          >
            <input
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              maxLength={60}
              placeholder={t('wb.languageHint')}
              className="w-full rounded-lg border border-rule bg-paper px-4 py-3 focus:border-accent-strong focus:outline-none"
            />
          </FieldRow>

          <FieldRow
            label={t('wb.period')}
            suggestion={analysis?.suggested_period ?? undefined}
            onAdopt={() => setPeriod(analysis?.suggested_period ?? '')}
            adopted={Boolean(analysis?.suggested_period) && period === analysis?.suggested_period}
          >
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              maxLength={120}
              placeholder={t('wb.periodPlaceholder')}
              className="w-full rounded-lg border border-rule bg-paper px-4 py-3 focus:border-accent-strong focus:outline-none"
            />
          </FieldRow>

          <FieldRow
            label={t('wb.placeOfOrigin')}
            suggestion={analysis?.suggested_origin ?? undefined}
            onAdopt={() => setOriginPlace(analysis?.suggested_origin ?? '')}
            adopted={Boolean(analysis?.suggested_origin) && originPlace === analysis?.suggested_origin}
          >
            <input
              value={originPlace}
              onChange={(e) => setOriginPlace(e.target.value)}
              maxLength={200}
              placeholder={t('wb.placeHint')}
              className="w-full rounded-lg border border-rule bg-paper px-4 py-3 focus:border-accent-strong focus:outline-none"
            />
          </FieldRow>

          <ReviewCandidates itemId={item.id} keywords={keywords} onChange={setKeywords} />
          <TagPicker expert onBusyChange={setTagsBusy} disabled={busy !== null || tagsBusy}
            chosen={keywords} onChange={setKeywords} offered={offered}
            suggested={[...(analysis?.keywords ?? []), ...item.contributor_keywords]} />

          <FamilyPicker
            families={offeredFamilies}
            selected={familyIds}
            onChange={setFamilyIds}
            community={community || null}
          />

          {/* Everything the model was less than 70% sure of was discarded
              before it reached this screen. What is here is what it could
              name a reason for; the picklist holds the rest of the tree. */}
          <FieldSheet tone="volunteer" values={fields} onChange={setFields} disabled={busy !== null || tagsBusy} />

          <AudiencePicker value={access} onChange={setAccess} disabled={busy !== null || tagsBusy} />

          {analysis && !simulated && (
            <div className="card bg-paper-2/50 px-4 py-3.5">
              <EvidenceLedger evidence={analysis.evidence} reasoning={analysis.reasoning} />
            </div>
          )}

          {analysis && analysis.confidence !== null && !simulated && (
            <p className="machine text-muted">
              {/* Kept for triage only, and never shown in the public portal.
                  ADR-012: it is the model's opinion of itself, it clusters on
                  0.95, and the ledger above is what can actually be checked. */}
              Model self-rating {Math.round(analysis.confidence * 100)}% · {analysis.provider}/
              {analysis.model}
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-5 rounded-lg border-s-[3px] border-critical bg-critical/8 px-4 py-3 text-sm text-critical">
            {error}
          </p>
        )}

        {/*
          Directly above the decision, and deliberately so. Publishing sends
          this record out in five languages; the last thing a knowledge expert reads
          before pressing Publish should be the five languages it will go out
          in, not the English they have already been through field by field.
        */}
        <div className="mt-8 border-t border-rule pt-6">
          <TranslationDeck itemId={item.id} siteLanguage={siteLanguage} />
        </div>

        <ReviewDraftControls itemId={item.id} deciding={busy !== null || tagsBusy} value={{ baseReviewedAt: item.reviewed_at ?? null, title, description, category, community, provenance, language, period, originPlace, keywords, familyIds, access, fields: fields.map(({ key, value }) => ({ key, value })) }} restore={draft => { setTitle(draft.title); setDescription(draft.description); setCategory(draft.category); setCommunity(draft.community); setProvenance(draft.provenance); setLanguage(draft.language); setPeriod(draft.period); setOriginPlace(draft.originPlace); setKeywords(draft.keywords); setFamilyIds(draft.familyIds); setAccess(draft.access); setFields(draft.fields); }} />
        <div className="mt-8 flex flex-wrap gap-3 border-t border-rule pt-6">
          {!category && <p className="w-full text-caution" role="status">{t('wb.categoryRequired')}</p>}
          {(transitions.includes('accepted') || item.status === 'accepted') && (
            <Decision
              onClick={() => decide('accepted')}
              busy={busy === 'accepted'}
              disabled={busy !== null || tagsBusy || !title.trim() || !category}
              tone="accept"
              icon={<Check size={15} />}
            >
              {t(item.status === 'accepted' ? 'wb.saveCatalogue' : 'wb.publish')}
            </Decision>
          )}
          {transitions.includes('shadow_gallery') && (
            <Decision
              onClick={() => decide('shadow_gallery')}
              busy={busy === 'shadow_gallery'}
              disabled={busy !== null || tagsBusy}
              tone="neutral"
              icon={<EyeOff size={15} />}
            >
              {t('wb.shadowGallery')}
            </Decision>
          )}
          {transitions.includes('rejected') && (
            <Decision
              onClick={() => decide('rejected')}
              busy={busy === 'rejected'}
              disabled={busy !== null || tagsBusy}
              tone="reject"
              icon={<X size={15} />}
            >
              {t('wb.reject')}
            </Decision>
          )}
          {transitions.includes('pending') && (
            <Decision
              onClick={() => decide('pending')}
              busy={busy === 'pending'}
              disabled={busy !== null || tagsBusy}
              tone="neutral"
              icon={<RotateCcw size={15} />}
            >
              {t('wb.returnToQueue')}
            </Decision>
          )}
          <button
            onClick={remove}
            disabled={busy !== null || tagsBusy}
            className="ms-auto flex items-center gap-1.5 px-3 py-2.5 text-sm text-critical hover:underline disabled:opacity-50"
          >
            {busy === 'delete' ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            {t('wb.moveToBin')}
          </button>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted">
          {t('wb.decisionNote')}
        </p>
      </div>
    </div>
  );
}

/**
 * Which control a corrected column field fills.
 *
 * A lookup rather than a switch inside the render, so that adding a seventh
 * column-backed field is a line here and a type error everywhere it was
 * forgotten, instead of a silently missing button.
 */
type Setters = {
  setCategory: (v: ItemCategory | '') => void;
  setCommunity: (v: Community | '') => void;
  setLanguage: (v: string) => void;
  setPeriod: (v: string) => void;
  setOriginPlace: (v: string) => void;
  setProvenance: (v: string) => void;
};

const ADOPTERS: Record<FieldColumn, (s: Setters, value: string) => void> = {
  category: (s, v) => s.setCategory(v as ItemCategory),
  community: (s, v) => s.setCommunity(v as Community),
  language: (s, v) => s.setLanguage(v),
  period: (s, v) => s.setPeriod(v),
  origin_place: (s, v) => s.setOriginPlace(v),
  provenance: (s, v) => s.setProvenance(v),
};

/**
 * Who the record is for.
 *
 * This is the Stakeholders domain of Erez's tree, answered where it makes sense
 * — as a question about the record rather than as a field catalogued on it. An
 * item is not "Researchers"; a decision about who may see it is.
 *
 * Each option states its effect in the same breath as its name, and the effects
 * are written as what actually happens today. Three of the four withhold a
 * record from the public portal and show it to volunteers, because there is no
 * sign-in for a family member or a researcher yet. A reviewer who thought they
 * had opened a door to researchers would have been misled by their own tool.
 */
function AudiencePicker({
  value,
  onChange,
  disabled,
}: {
  value: AccessLevel;
  onChange: (value: AccessLevel) => void;
  disabled: boolean;
}) {
  const t = useMessages();
  return (
    <fieldset className="rounded-2xl border border-rule bg-paper-2/50 p-4">
      <legend className="eyebrow px-1">{t('wb.whoFor')}</legend>
      <div className="mt-1 space-y-1.5">
        {ACCESS_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex cursor-pointer gap-3 rounded-lg px-3 py-2.5 transition-colors',
              value === option.value ? 'bg-paper' : 'hover:bg-paper/60',
            )}
          >
            <input
              type="radio"
              name="access"
              value={option.value}
              checked={value === option.value}
              disabled={disabled}
              onChange={() => onChange(option.value)}
              className="mt-1 h-[1.05rem] w-[1.05rem] shrink-0 accent-[var(--color-accent-strong)]"
            />
            <span>
              <span className="block font-medium">{option.label}</span>
              <span className="mt-0.5 block text-sm leading-relaxed text-muted">
                {option.effect}
              </span>
              <span className="machine mt-0.5 block text-xs text-muted">{option.stakeholders}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * What the machine read off the file, and the place to correct it.
 *
 * It was a read-only paragraph, so a misread inscription could be seen and not
 * fixed anywhere in the archive (Tirza, 22.09.2026). The correction is kept
 * beside the machine's text, never over it, and the machine's version stays
 * one click away. See migration 0030.
 */
function ReadingEditor({
  itemId,
  analysisId,
  label,
  machine,
  corrected,
  other,
  field,
  correctedBy,
}: {
  itemId: string;
  analysisId: string;
  label: string;
  machine: string;
  corrected: string | null;
  /** The other block's saved correction, sent back unchanged: the route writes both. */
  other: { ocrText?: string | null; transcript?: string | null };
  field: 'ocrText' | 'transcript';
  correctedBy: string | null;
}) {
  const t = useMessages();
  const router = useRouter();
  const [text, setText] = useState(corrected ?? machine);
  const [saved, setSaved] = useState(corrected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMachine, setShowMachine] = useState(false);

  const dirty = text.trim() !== (saved ?? machine).trim();

  async function save() {
    setBusy(true);
    setError(null);
    // Back to exactly the machine's text is no correction at all.
    const value = text.trim() === machine.trim() ? null : text.trim();
    try {
      const res = await fetch(`/api/items/${itemId}/reading`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId,
          ocrText: field === 'ocrText' ? value : (other.ocrText ?? null),
          transcript: field === 'transcript' ? value : (other.transcript ?? null),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.error?.message ?? t('error.didNotGoThrough'));
      setSaved(value);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.didNotGoThrough'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-4 card bg-paper-2/50" open={Boolean(saved)}>
      <ReviewReadingDraft analysisId={analysisId} field={field} text={text} original={saved ?? machine} restore={setText} />
      <summary className="eyebrow cursor-pointer px-4 py-3">
        {label}
        {saved && <span className="ms-2 normal-case text-positive">· {t('wb.readingCorrected')}</span>}
      </summary>
      <div className="border-t border-rule px-4 py-3">
        {/* `transcription`, not `machine`: the mono stack ends in the generic
            `monospace`, which matches every character, so a Hebrew or
            Malayalam transcription never reached a face that could draw it. */}
        <textarea
          dir="auto"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={Math.min(14, Math.max(4, text.split('\n').length + 1))}
          className="transcription w-full resize-y rounded-lg border border-rule bg-paper p-3 focus:border-accent-strong focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || busy}
            className="flex h-9 items-center gap-1.5 rounded-full bg-accent-strong px-4 text-sm font-medium text-paper transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {t('wb.saveReading')}
          </button>
          {saved && (
            <button
              type="button"
              onClick={() => setShowMachine((v) => !v)}
              className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              {showMachine ? t('wb.hideMachineReading') : t('wb.showMachineReading')}
            </button>
          )}
        </div>
        {saved && (
          <p className="mt-2 text-sm text-muted">
            {correctedBy ? t('wb.correctedByVolunteer') : t('wb.correctedByContributor')}
          </p>
        )}
        {error && (
          <p role="status" className="mt-2 text-sm text-caution">
            {error}
          </p>
        )}
        {showMachine && (
          <p dir="auto" className="transcription mt-3 max-h-72 overflow-auto rounded-lg bg-paper-3/60 p-3 text-muted">
            {machine}
          </p>
        )}
      </div>
    </details>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow mb-0.5">{label}</dt>
      <dd className="machine break-words">{children}</dd>
    </div>
  );
}

/** A field plus, when there is one, the machine's proposal for it. */
function FieldRow({
  label,
  children,
  suggestion,
  onAdopt,
  adopted,
}: {
  label: string;
  children: React.ReactNode;
  suggestion?: string;
  onAdopt?: () => void;
  adopted?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="eyebrow">{label}</span>
        {suggestion && onAdopt && (
          <button
            onClick={onAdopt}
            disabled={adopted}
            className={cn(
              'font-mono text-[0.6875rem] underline-offset-2',
              adopted ? 'text-muted' : 'text-accent hover:underline',
            )}
          >
            {adopted ? 'suggestion used' : 'use suggestion'}
          </button>
        )}
      </div>
      {children}
      {suggestion && (
        <p className="machine mt-1.5 flex gap-1.5 text-muted">
          <ArrowLeft size={12} className="mt-1 shrink-0 rotate-90" aria-hidden />
          <span>{suggestion}</span>
        </p>
      )}
    </div>
  );
}


/** Families, offered only for the community the record has been placed in. */
function FamilyPicker({
  families,
  selected,
  onChange,
  community,
}: {
  families: Family[];
  selected: string[];
  onChange: (next: string[]) => void;
  community: Community | null;
}) {
  const t = useMessages();
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((f) => f !== id) : [...selected, id]);
  }

  return (
    <div>
      <span className="eyebrow mb-1.5 block">{t('wb.families')}</span>

      {!community ? (
        <p className="text-sm text-muted">{t('wb.chooseCommunityFirst')}</p>
      ) : families.length === 0 ? (
        <p className="text-sm text-muted">
          {t('wb.noFamiliesYet', { community: t(communityKey(community)) })}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {families.map((family) => {
            const on = selected.includes(family.id);
            return (
              <button
                key={family.id}
                type="button"
                onClick={() => toggle(family.id)}
                aria-pressed={on}
                className={cn(
                  'flex items-center gap-2 border px-3 py-1.5 text-sm transition-colors',
                  on ? 'border-primary bg-primary text-white' : 'border-rule bg-paper-2 hover:border-accent',
                )}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: COMMUNITY_COLORS[family.community] }}
                />
                {family.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Decision({
  onClick,
  busy,
  disabled,
  tone,
  icon,
  children,
}: {
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
  tone: 'accept' | 'reject' | 'neutral';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const tones = {
    accept: 'bg-positive text-paper',
    reject: 'border border-critical text-critical hover:bg-critical/8',
    neutral: 'border border-rule-strong bg-paper text-ink hover:border-accent-strong hover:bg-accent-wash',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-11 items-center gap-2 rounded-full px-5 font-medium transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50',
        tones[tone],
      )}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}
