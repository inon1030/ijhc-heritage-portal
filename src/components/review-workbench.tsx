'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, EyeOff, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import { EvidenceLedger } from '@/components/evidence-ledger';
import { FieldSheet } from '@/components/field-sheet';
import { FilePreview } from '@/components/file-preview';
import { SimulatedNotice, StatusPill } from '@/components/primitives';
import { ACCESS_OPTIONS, accessOption } from '@/lib/access';
import { COMMUNITY_COLORS } from '@/lib/communities';
import { fieldDef, type FieldColumn, type FieldValue } from '@/lib/fields/registry';
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
  type Keyword,
} from '@/lib/types';
import { cn, formatBytes, formatDuration } from '@/lib/utils';

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
}: {
  item: ItemDetail;
  /** The only terms a record may carry. Managed at /manage/vocabulary. */
  vocabulary: Keyword[];
  families: Family[];
  selectedFamilyIds: string[];
}) {
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
  const [error, setError] = useState<string | null>(null);

  const transitions = allowedTransitions(item.status);
  const shown: ItemFile | null = item.files[showing] ?? item.file;

  // Only terms offered for the chosen community, plus the global ones. The
  // list narrows as soon as a reviewer picks a stream, which is the point.
  const offered = vocabulary.filter((k) => k.community === null || k.community === community);
  const offeredFamilies = community ? families.filter((f) => f.community === community) : [];

  async function decide(status: ItemStatus) {
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
      setError(e instanceof Error ? e.message : 'The decision did not save. Try again.');
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${item.title}" and its file? This cannot be undone.`)) return;
    setBusy('delete');
    setError(null);

    try {
      const res = await fetch(`/api/items/${item.id}/review`, { method: 'DELETE' });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error.message);

      router.push('/review');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The record was not deleted. Try again.');
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* The original */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow">The original</h2>
          <StatusPill status={item.status} />
        </div>

        {/* Where it was captured from, above the file rather than buried in the
            metadata: for a captured page the address *is* the provenance, and
            a reviewer should be able to open the source before reading a word
            of what the archive made of it. */}
        {item.source_url && (
          <p className="mb-3 rounded-lg border-l-[3px] border-cochin bg-turquoise-wash/60 px-3 py-2 text-sm">
            <span className="eyebrow mr-2">Captured from</span>
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
                  <FilePreview file={file} alt={`Page ${index + 1}`} fit="cover" />
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
            <Fact label="File name">{shown.file_name}</Fact>
            <Fact label="Type">{shown.mime_type}</Fact>
            <Fact label="Size">{formatBytes(shown.byte_size)}</Fact>
            <Fact label="Dimensions">
              {shown.width && shown.height
                ? `${shown.width} × ${shown.height} px`
                : shown.duration_ms
                  ? formatDuration(shown.duration_ms)
                  : 'not measured'}
            </Fact>
          </dl>
        )}

        <p className="mt-3 text-xs leading-relaxed text-muted">
          Measured from the file itself. Nothing above was generated.
        </p>

        {analysis?.ocr_text && (
          <details className="mt-4 card bg-paper-2/50">
            <summary className="eyebrow cursor-pointer px-4 py-3">Text the model read</summary>
            <p className="machine max-h-72 overflow-auto border-t border-rule px-4 py-3 whitespace-pre-wrap">
              {analysis.ocr_text}
            </p>
          </details>
        )}

        {analysis?.transcript && (
          <details className="mt-3 card bg-paper-2/50">
            <summary className="eyebrow cursor-pointer px-4 py-3">Transcript</summary>
            <p className="machine max-h-72 overflow-auto border-t border-rule px-4 py-3 whitespace-pre-wrap">
              {analysis.transcript}
            </p>
          </details>
        )}
      </div>

      {/* The record */}
      <div>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="eyebrow">The record</h2>
          <span className="eyebrow text-right">
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
          <section className="mb-5 rounded-lg border-l-[3px] border-cochin bg-turquoise-wash/60 px-4 py-3.5">
            <p className="eyebrow mb-1.5">What the contributor said</p>
            {item.contributor_description && (
              <p className="leading-relaxed">{item.contributor_description}</p>
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
                <p className="eyebrow mb-2">They corrected the archive on</p>
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
                          Use this
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
                and the families a volunteer has tied that address to. The
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
                    <span className="text-sm text-muted">Known family:</span>
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
            The clause is shown rather than the verdict: a volunteer can agree
            or disagree with "a festival in Cusco, Peru" at a glance, and the
            model is wrong about faded and cropped items often enough that this
            has to read as a question. */}
        {analysis?.off_topic && !simulated && (
          <section className="mb-5 rounded-lg border-l-[3px] border-caution bg-accent-wash px-4 py-3.5">
            <p className="eyebrow mb-1">This may not belong to the archive</p>
            {analysis.off_topic_reason && (
              <p className="machine leading-relaxed text-ink-2">{analysis.off_topic_reason}</p>
            )}
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              A suggestion, not a decision. Reject it below, or catalogue it like any other record
              if the archive read it wrongly.
            </p>
          </section>
        )}

        {simulated && <SimulatedNotice className="mb-5" />}
        {analysis?.status === 'failed' && !simulated && (
          <p className="mb-5 rounded-lg border-l-[3px] border-caution bg-accent-wash px-3 py-2 text-xs text-caution">
            Analysis did not run for this item. Fill the fields in yourself.
          </p>
        )}

        <div className="space-y-5">
          <FieldRow label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="w-full rounded-lg border border-rule bg-paper px-4 py-3 focus:border-accent-strong focus:outline-none"
            />
          </FieldRow>

          <FieldRow
            label="Description"
            suggestion={analysis?.summary ?? undefined}
            onAdopt={() => setDescription(analysis?.summary ?? '')}
            adopted={description === analysis?.summary}
          >
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="What a visitor should read on the record page."
              className="w-full resize-y rounded-lg border border-rule bg-paper px-4 py-3 text-sm focus:border-accent-strong focus:outline-none"
            />
          </FieldRow>

          <FieldRow
            label="Kind of item"
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
              <option value="">Not catalogued</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </FieldRow>

          <FieldRow
            label="Community"
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
              <option value="">Not identified</option>
              {COMMUNITIES.map((c) => (
                <option key={c} value={c}>
                  {COMMUNITY_LABELS[c]}
                </option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="Provenance">
            <input
              value={provenance}
              onChange={(e) => setProvenance(e.target.value)}
              maxLength={2000}
              placeholder="Who owned it, where it was kept, how it reached the archive"
              className="w-full rounded-lg border border-rule bg-paper px-4 py-3 focus:border-accent-strong focus:outline-none"
            />
          </FieldRow>

          <FieldRow
            label="Language"
            suggestion={analysis?.language ?? undefined}
            onAdopt={() => setLanguage(analysis?.language ?? '')}
            adopted={Boolean(analysis?.language) && language === analysis?.language}
          >
            <input
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              maxLength={60}
              placeholder="Marathi, Malayalam, Judeo-Arabic, Hebrew, English"
              className="w-full rounded-lg border border-rule bg-paper px-4 py-3 focus:border-accent-strong focus:outline-none"
            />
          </FieldRow>

          <FieldRow
            label="Period"
            suggestion={analysis?.suggested_period ?? undefined}
            onAdopt={() => setPeriod(analysis?.suggested_period ?? '')}
            adopted={Boolean(analysis?.suggested_period) && period === analysis?.suggested_period}
          >
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              maxLength={120}
              placeholder="1890s, late 19th century, before 1948"
              className="w-full rounded-lg border border-rule bg-paper px-4 py-3 focus:border-accent-strong focus:outline-none"
            />
          </FieldRow>

          <FieldRow
            label="Place of origin"
            suggestion={analysis?.suggested_origin ?? undefined}
            onAdopt={() => setOriginPlace(analysis?.suggested_origin ?? '')}
            adopted={Boolean(analysis?.suggested_origin) && originPlace === analysis?.suggested_origin}
          >
            <input
              value={originPlace}
              onChange={(e) => setOriginPlace(e.target.value)}
              maxLength={200}
              placeholder="Calcutta, India"
              className="w-full rounded-lg border border-rule bg-paper px-4 py-3 focus:border-accent-strong focus:outline-none"
            />
          </FieldRow>

          <VocabularyPicker
            keywords={keywords}
            onChange={setKeywords}
            offered={offered}
            suggestions={analysis?.keywords ?? []}
            contributorTerms={item.contributor_keywords}
            communityChosen={Boolean(community)}
          />

          <FamilyPicker
            families={offeredFamilies}
            selected={familyIds}
            onChange={setFamilyIds}
            community={community || null}
          />

          {/* Everything the model was less than 70% sure of was discarded
              before it reached this screen. What is here is what it could
              name a reason for; the picklist holds the rest of the tree. */}
          <FieldSheet tone="volunteer" values={fields} onChange={setFields} disabled={busy !== null} />

          <AudiencePicker value={access} onChange={setAccess} disabled={busy !== null} />

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
          <p role="alert" className="mt-5 rounded-lg border-l-[3px] border-critical bg-critical/8 px-4 py-3 text-sm text-critical">
            {error}
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-3 border-t border-rule pt-6">
          {transitions.includes('accepted') && (
            <Decision
              onClick={() => decide('accepted')}
              busy={busy === 'accepted'}
              disabled={busy !== null || !title.trim()}
              tone="accept"
              icon={<Check size={15} />}
            >
              Publish
            </Decision>
          )}
          {transitions.includes('shadow_gallery') && (
            <Decision
              onClick={() => decide('shadow_gallery')}
              busy={busy === 'shadow_gallery'}
              disabled={busy !== null}
              tone="neutral"
              icon={<EyeOff size={15} />}
            >
              Hold in Shadow Gallery
            </Decision>
          )}
          {transitions.includes('rejected') && (
            <Decision
              onClick={() => decide('rejected')}
              busy={busy === 'rejected'}
              disabled={busy !== null}
              tone="reject"
              icon={<X size={15} />}
            >
              Reject
            </Decision>
          )}
          {transitions.includes('pending') && (
            <Decision
              onClick={() => decide('pending')}
              busy={busy === 'pending'}
              disabled={busy !== null}
              tone="neutral"
              icon={<RotateCcw size={15} />}
            >
              Return to the queue
            </Decision>
          )}
          <button
            onClick={remove}
            disabled={busy !== null}
            className="ml-auto flex items-center gap-1.5 px-3 py-2.5 text-sm text-critical hover:underline disabled:opacity-50"
          >
            {busy === 'delete' ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Delete permanently
          </button>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted">
          Rejecting keeps the record for the archive team and removes it from the public portal. It
          can be returned to the queue later. Deleting removes the record and its file for good.
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
  return (
    <fieldset className="rounded-xl border border-rule bg-paper-2/50 p-4">
      <legend className="eyebrow px-1">Who this is for</legend>
      <div className="mt-1 space-y-1.5">
        {ACCESS_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex cursor-pointer gap-3 rounded-lg px-3 py-2.5 transition-colors',
              value === option.value ? 'bg-paper shadow-soft' : 'hover:bg-paper/60',
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

/**
 * Keywords, drawn from the archive's own vocabulary and nothing else.
 *
 * The client asked for exactly this: two volunteers cataloguing the same kind
 * of object should reach for the same word. The list narrows to the chosen
 * community plus the terms offered everywhere.
 *
 * The model's suggestions still appear, split in two. Ones already in the
 * vocabulary are one click away. Ones outside it are shown greyed, because they
 * cannot go on a record — they are queued at /manage/vocabulary for someone to
 * decide whether they should be able to.
 */
function VocabularyPicker({
  keywords,
  onChange,
  offered,
  suggestions,
  contributorTerms,
  communityChosen,
}: {
  keywords: string[];
  onChange: (next: string[]) => void;
  offered: Keyword[];
  suggestions: string[];
  contributorTerms: string[];
  communityChosen: boolean;
}) {
  const [filter, setFilter] = useState('');

  const terms = offered.map((k) => k.term);
  const lower = new Set(terms.map((t) => t.toLowerCase()));

  const proposed = [...new Set([...suggestions, ...contributorTerms])].filter(
    (t) => !keywords.some((k) => k.toLowerCase() === t.toLowerCase()),
  );
  const available = proposed.filter((t) => lower.has(t.toLowerCase()));
  const notInVocabulary = proposed.filter((t) => !lower.has(t.toLowerCase()));

  const matching = terms
    .filter((t) => !keywords.includes(t))
    .filter((t) => !filter.trim() || t.toLowerCase().includes(filter.trim().toLowerCase()));

  function add(term: string) {
    if (keywords.includes(term) || keywords.length >= 20) return;
    onChange([...keywords, term]);
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="eyebrow">Keywords</span>
        <span className="machine text-muted">
          {communityChosen ? `${terms.length} offered` : 'choose a community to narrow the list'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {keywords.map((keyword) => (
          <span
            key={keyword}
            className="inline-flex items-center gap-1.5 border border-ink bg-ink px-2.5 py-1 font-mono text-xs text-paper"
          >
            {keyword}
            <button
              onClick={() => onChange(keywords.filter((k) => k !== keyword))}
              aria-label={`Remove ${keyword}`}
              className="opacity-60 hover:opacity-100"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {keywords.length === 0 && <span className="text-sm text-muted italic">None yet</span>}
      </div>

      {available.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="machine text-muted">suggested:</span>
          {available.map((term) => {
            const exact = terms.find((t) => t.toLowerCase() === term.toLowerCase())!;
            return (
              <button
                key={term}
                onClick={() => add(exact)}
                className="border border-dashed border-accent/50 px-2 py-0.5 font-mono text-xs text-accent hover:bg-accent-wash"
              >
                + {exact}
              </button>
            );
          })}
        </div>
      )}

      {notInVocabulary.length > 0 && (
        <p className="mt-2 text-sm text-muted">
          Not in the vocabulary, so not selectable here:{' '}
          <span className="machine">{notInVocabulary.join(', ')}</span>. They are queued under{' '}
          <a href="/manage/vocabulary" className="underline underline-offset-2 hover:text-accent">
            Manage
          </a>
          .
        </p>
      )}

      {terms.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-rule-strong bg-paper-2/60 px-3 py-3 text-sm text-muted">
          The vocabulary holds nothing for this community yet. Add terms under Manage and they
          become selectable here.
        </p>
      ) : (
        <>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter the vocabulary"
            maxLength={60}
            className="mt-3 h-13 w-full rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:outline-none"
          />
          <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-auto">
            {matching.map((term) => (
              <button
                key={term}
                onClick={() => add(term)}
                className="border border-rule bg-paper-2 px-2.5 py-1 text-sm transition-colors hover:border-accent hover:bg-accent-wash"
              >
                {term}
              </button>
            ))}
            {matching.length === 0 && (
              <span className="text-sm text-muted italic">Nothing matches that.</span>
            )}
          </div>
        </>
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
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((f) => f !== id) : [...selected, id]);
  }

  return (
    <div>
      <span className="eyebrow mb-1.5 block">Families</span>

      {!community ? (
        <p className="text-sm text-muted">Choose a community first — families belong to one.</p>
      ) : families.length === 0 ? (
        <p className="text-sm text-muted">
          No families registered for {COMMUNITY_LABELS[community]} yet.
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
                  on ? 'border-ink bg-ink text-paper' : 'border-rule bg-paper-2 hover:border-accent',
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
    accept: 'bg-positive text-paper shadow-soft hover:shadow-lift',
    reject: 'border border-critical text-critical hover:bg-critical/8',
    neutral: 'border border-rule-strong bg-paper text-ink hover:border-accent-strong hover:bg-accent-wash',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-12 items-center gap-2 rounded-full px-5 font-medium transition-all duration-200 hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50',
        tones[tone],
      )}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}
