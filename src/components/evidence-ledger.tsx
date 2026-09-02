import { Eye, HelpCircle, Lightbulb } from 'lucide-react';
import { inTreeOrder, fieldDef } from '@/lib/fields/registry';
import {
  EVIDENCE_BASIS_LABELS,
  LEGACY_EVIDENCE_LABELS,
  type EvidenceBasis,
  type EvidenceLedger as Ledger,
} from '@/lib/types';

/**
 * What each suggestion rests on.
 *
 * This is what replaced the confidence percentage on screen (ADR-012). The
 * number was a model's opinion of itself — across the seeded analyses every
 * value landed on a 0.05 grid and eight of fifteen were exactly 0.95 — and a
 * reviewer can do nothing with it. "The imprint reads Bombay 1907" they can go
 * and check.
 *
 * The number now decides one thing only, and out of sight: whether a field is
 * offered at all. Nothing below 70% reaches this table, so every row here is
 * something the archive is prepared to put in front of a person.
 *
 * Rows are keyed by field, and the keys are the logical tree's. Analyses stored
 * before the tree used six fixed names, three of which are gone; those fall
 * back to LEGACY_EVIDENCE_LABELS and then to the raw key, so an old record
 * still renders rather than showing a blank column.
 */

const BASIS_STYLE: Record<EvidenceBasis, { icon: typeof Eye; className: string }> = {
  read: { icon: Eye, className: 'text-positive' },
  inferred: { icon: Lightbulb, className: 'text-caution' },
  guess: { icon: HelpCircle, className: 'text-muted' },
};

function labelFor(key: string): string {
  return fieldDef(key)?.label ?? LEGACY_EVIDENCE_LABELS[key] ?? key;
}

export function EvidenceLedger({
  evidence,
  reasoning,
}: {
  evidence: Ledger | null;
  reasoning: string | null;
}) {
  const rows = inTreeOrder(
    Object.entries(evidence ?? {}).filter(([, entry]) => entry && BASIS_STYLE[entry.basis]),
    ([key]) => key,
  );

  // An older analysis has no ledger. Its reasoning line is the same idea in
  // prose, so show that rather than nothing.
  if (rows.length === 0) {
    if (!reasoning) return null;
    return (
      <div>
        <p className="eyebrow mb-1.5">What this rests on</p>
        <p className="machine text-ink-2">{reasoning}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow mb-2">What each answer rests on</p>
      <ul className="divide-y divide-rule border-y border-rule">
        {rows.map(([key, entry]) => {
          const { icon: Icon, className } = BASIS_STYLE[entry.basis];
          return (
            <li key={key} className="flex items-start gap-3 py-2.5">
              <Icon size={16} className={`mt-0.5 shrink-0 ${className}`} aria-hidden />
              <span className="w-28 shrink-0 text-sm font-medium">{labelFor(key)}</span>
              <span className="flex-1">
                <span className={`machine block ${className}`}>
                  {EVIDENCE_BASIS_LABELS[entry.basis]}
                </span>
                {entry.note && <span className="block text-sm text-muted">{entry.note}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {reasoning && <p className="machine mt-3 text-ink-2">{reasoning}</p>}
    </div>
  );
}
