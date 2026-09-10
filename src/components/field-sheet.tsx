'use client';

import { useId, useMemo } from 'react';
import { Eye, HelpCircle, Lightbulb, Pencil, Plus, Undo2, X } from 'lucide-react';
import { useMessages } from '@/lib/i18n/provider';
import {
  FIELDS,
  GROUP_ORDER,
  ROW_FIELDS,
  fieldDef,
  inTreeOrder,
  isCorrected,
  type FieldDef,
  type FieldValue,
} from '@/lib/fields/registry';
import { type EvidenceBasis } from '@/lib/types';
import {
  basisLabel,
  fieldHint,
  fieldLabel,
  groupLabelKey,
  optionLabel,
} from '@/lib/fields/labels';
import { cn } from '@/lib/utils';

/**
 * The archive's findings, open to correction.
 *
 * The sheet starts almost empty, on purpose. The logical tree has forty-odd
 * branches and a typical photograph belongs in five of them; showing the rest
 * as blank inputs would turn a two-minute contribution into a form, and a form
 * is the thing that stops people contributing. So the rule is:
 *
 *   a field appears because the machine cleared 70% on it,
 *   or because someone asked for it by name.
 *
 * **Everything shown is editable, including what the machine read.** The person
 * holding the original knows things no model can see — that the photograph is
 * their grandmother's wedding, that the year on the back is 1907 — and a
 * finding they cannot correct is a finding they have to argue with a volunteer
 * about later. Correcting one costs nothing: a contributor's value lands in
 * their own row and never in `items`. A volunteer still decides what the record
 * says.
 *
 * A correction is marked, and the mark is deliberately small: one pencil, no
 * colour, no banner. It exists so a volunteer reading the record afterwards can
 * see at a glance which values came from the machine and which a person
 * overruled — and being overruled by the contributor usually makes a value
 * *more* trustworthy, not less, so it is not a warning and must not look like
 * one.
 *
 * Two shapes of row, because the tree has two kinds of node. A *question*
 * ("Cities and Villages") gets an input: the item answers it or it does not. A
 * *branch* ("Food", "Marriage") gets no input at all — the record is filed
 * there or it is not, and the × is how you say it is not.
 */

const BASIS_STYLE: Record<EvidenceBasis, { icon: typeof Eye; className: string }> = {
  read: { icon: Eye, className: 'text-positive' },
  inferred: { icon: Lightbulb, className: 'text-caution' },
  guess: { icon: HelpCircle, className: 'text-muted' },
};

export function FieldSheet({
  values,
  onChange,
  disabled = false,
  tone,
  includeBasics = false,
}: {
  values: FieldValue[];
  onChange: (values: FieldValue[]) => void;
  disabled?: boolean;
  /** Only the wording differs. A contributor is not being asked to catalogue. */
  tone: 'contributor' | 'volunteer';
  /**
   * Whether the six column-backed fields — community, period, place, language,
   * kind, provenance — belong in this sheet.
   *
   * True on the contribution screen, where they are the machine's findings and
   * a contributor may correct them; their corrections are stored as claims and
   * never as the record. False in the workbench, where each of the six has its
   * own control that writes the record itself, and a second editor for the same
   * value would be two places to look with no rule about which wins.
   */
  includeBasics?: boolean;
}) {
  const t = useMessages();
  const addId = useId();
  const catalogue = includeBasics ? FIELDS : ROW_FIELDS;

  const present = useMemo(
    () =>
      inTreeOrder(
        values.filter((v) => {
          const def = fieldDef(v.key);
          return def && (includeBasics || !def.column);
        }),
        (v) => v.key,
      ),
    [values, includeBasics],
  );

  const taken = new Set(present.map((v) => v.key));
  const available = catalogue.filter((field) => !taken.has(field.key));

  function set(key: string, value: string) {
    onChange(values.map((v) => (v.key === key ? { ...v, value } : v)));
  }

  function revert(key: string) {
    onChange(
      values.map((v) => (v.key === key ? { ...v, value: v.suggested ?? v.value } : v)),
    );
  }

  function remove(key: string) {
    onChange(values.filter((v) => v.key !== key));
  }

  function add(key: string) {
    const def = fieldDef(key);
    if (!def || taken.has(key)) return;
    // A facet's value is its own name, so choosing it from the list is the
    // whole act. A question field starts empty and waits to be answered.
    onChange([...values, { key, value: def.type === 'facet' ? def.label : '' }]);
  }

  const groups = GROUP_ORDER.map((group) => ({
    group,
    rows: present.filter((v) => fieldDef(v.key)?.group === group),
  })).filter(({ rows }) => rows.length > 0);

  return (
    <section className="space-y-5">
      <div>
        <p className="eyebrow">{t('fields.heading')}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          {t(
            tone === 'contributor'
              ? present.length > 0
                ? 'fields.someContributor'
                : 'fields.noneContributor'
              : present.length > 0
                ? 'fields.someVolunteer'
                : 'fields.noneVolunteer',
          )}
        </p>
      </div>

      {groups.length > 0 && (
        <div className="space-y-6">
          {groups.map(({ group, rows }) => (
            <div key={group}>
              <p className="mb-2.5 border-b border-rule pb-1.5 text-sm font-medium text-ink-2">
                {t(groupLabelKey(group))}
              </p>
              <div className="space-y-4">
                {rows.map((row) => (
                  <FieldRow
                    key={row.key}
                    def={fieldDef(row.key)!}
                    row={row}
                    disabled={disabled}
                    onValue={(value) => set(row.key, value)}
                    onRevert={() => revert(row.key)}
                    onRemove={() => remove(row.key)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div className="rounded-xl border border-dashed border-rule-strong bg-paper-2/50 p-4">
          <label htmlFor={addId} className="eyebrow mb-1.5 flex items-center gap-1.5">
            <Plus size={14} aria-hidden />
            {t('fields.add')}
          </label>
          <p className="mb-2.5 text-sm text-muted">
            {t(tone === 'contributor' ? 'fields.addContributor' : 'fields.addVolunteer')}
          </p>
          {/*
            A native select, not a custom popover. It is one tap on a phone, it
            is searchable by typing on a desktop, and the platform's own list is
            the one screen readers and switch controls already know how to
            drive. The grouping is the tree's own.
          */}
          <select
            id={addId}
            value=""
            disabled={disabled}
            onChange={(e) => {
              add(e.target.value);
              e.currentTarget.value = '';
            }}
            className="h-12 w-full rounded-lg border border-rule bg-paper px-3.5 focus:border-accent-strong focus:outline-none sm:max-w-sm"
          >
            <option value="">{t('fields.choose')}</option>
            {GROUP_ORDER.map((group) => {
              const options = available.filter((field) => field.group === group);
              if (!options.length) return null;
              return (
                <optgroup key={group} label={t(groupLabelKey(group))}>
                  {options.map((field) => (
                    <option key={field.key} value={field.key}>
                      {fieldLabel(t, field)}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>
      )}
    </section>
  );
}

function FieldRow({
  def,
  row,
  disabled,
  onValue,
  onRevert,
  onRemove,
}: {
  def: FieldDef;
  row: FieldValue;
  disabled: boolean;
  onValue: (value: string) => void;
  onRevert: () => void;
  onRemove: () => void;
}) {
  const t = useMessages();
  const id = useId();
  const corrected = isCorrected(row);
  const fromMachine = Boolean(row.basis) && !corrected;

  const control =
    def.type === 'enum' ? (
      <select
        id={id}
        value={row.value}
        onChange={(e) => onValue(e.target.value)}
        disabled={disabled}
        className="h-12 w-full rounded-lg border border-rule bg-paper px-3.5 focus:border-accent-strong focus:bg-accent-wash/30 focus:outline-none"
      >
        <option value="">{t('common.notDetermined')}</option>
        {(def.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {optionLabel(t, def, option)}
          </option>
        ))}
      </select>
    ) : (
      <input
        id={id}
        value={row.value}
        onChange={(e) => onValue(e.target.value)}
        disabled={disabled}
        maxLength={def.maxLength}
        className={cn(
          'h-12 w-full rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:bg-accent-wash/30 focus:outline-none',
          !row.value && 'border-dashed',
        )}
      />
    );

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-1.5">
          {def.type === 'facet' ? (
            <span className="text-sm font-medium">{fieldLabel(t, def)}</span>
          ) : (
            <label htmlFor={id} className="text-sm font-medium">
              {fieldLabel(t, def)}
            </label>
          )}
          {corrected && <CorrectedMark />}
        </span>

        <span className="flex items-center gap-0.5">
          {corrected && (
            <button
              type="button"
              onClick={onRevert}
              disabled={disabled}
              title={t('fields.putBack', { value: row.suggested ?? '' })}
              className="rounded p-1 text-muted transition-colors hover:bg-paper-3 hover:text-ink disabled:opacity-40"
            >
              <Undo2 size={13} aria-hidden />
              <span className="sr-only">{t('fields.undoChange', { field: fieldLabel(t, def) })}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="rounded p-1 text-muted transition-colors hover:bg-critical/10 hover:text-critical disabled:opacity-40"
          >
            <X size={14} aria-hidden />
            <span className="sr-only">{t('fields.removeField', { field: fieldLabel(t, def) })}</span>
          </button>
        </span>
      </div>

      {/* A facet has no value to type: the record either belongs under the
          branch or it does not, and removing it is how you say it does not. */}
      {def.type !== 'facet' && control}

      <p className={cn('text-sm leading-relaxed text-muted', def.type === 'facet' ? '' : 'mt-1.5')}>
        {fieldHint(t, def)}
      </p>

      {/*
        What the machine's answer rests on, beside the answer rather than in a
        table underneath it. A reviewer cannot check "0.82"; they can check
        "the imprint reads Bombay 1907" against the image on the left.

        It disappears once a person has overruled the value, because it would
        then be describing something that is no longer on screen. What the
        machine read is still available — on the undo control, and in the
        analysis a knowledge expert sees.
      */}
      {fromMachine && <Basis basis={row.basis!} note={row.note ?? null} />}
    </div>
  );
}

/**
 * The mark for a value a person corrected.
 *
 * Eleven pixels, no colour, no border, no word. It answers one question for
 * whoever reads the record later — *did the machine say this, or did someone?*
 * — and it must not read as a warning: a contributor overruling the archive
 * about their own family photograph is the most reliable thing on the page.
 */
function CorrectedMark() {
  const t = useMessages();
  return (
    <span
      title={t('common.editedByContributor')}
      className="inline-flex translate-y-px items-center text-muted/70"
    >
      <Pencil size={11} strokeWidth={2} aria-hidden />
      <span className="sr-only">{t('common.editedByContributor')}</span>
    </span>
  );
}

function Basis({ basis, note }: { basis: EvidenceBasis; note: string | null }) {
  const t = useMessages();
  const { icon: Icon, className } = BASIS_STYLE[basis];
  return (
    <p className={cn('machine mt-1 flex items-start gap-1.5 text-sm', className)}>
      <Icon size={14} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        {basisLabel(t, basis)}
        {note && <span className="text-muted"> — {note}</span>}
      </span>
    </p>
  );
}
