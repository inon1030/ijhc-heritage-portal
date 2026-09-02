import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import {
  CONSENT_CLAUSES,
  CONSENT_VERSION,
  contactSentence,
} from '@/lib/consent';

export const metadata: Metadata = {
  title: 'How your contribution is handled',
  description:
    'What happens to material sent to the Indian Jewish Heritage Center archive, what is published, and what is done with an email address.',
};

/**
 * The full notice, at a permanent address.
 *
 * The upload form shows the same clauses inline, from the same source, so the
 * two can never disagree. This page exists so the terms can be read without
 * being in the middle of contributing, and linked to from the footer.
 */
export default function HandlingPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href="/portal"
        className="mb-8 inline-flex h-11 items-center gap-2 rounded-full border border-rule px-4 text-muted transition-all duration-200 hover:-translate-x-0.5 hover:border-accent-strong hover:text-ink"
      >
        <ArrowLeft size={15} /> Back to the portal
      </Link>

      <p className="eyebrow">Version {CONSENT_VERSION}</p>
      <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">
        How your contribution is handled
      </h1>
      <p className="mt-4 leading-relaxed text-muted sm:text-lg">
        Plain terms, and the ones actually shown to you before you send anything. Every clause
        describes something the archive does rather than something it reserves the right to do.
      </p>

      <div className="mt-10 space-y-9">
        {CONSENT_CLAUSES.map((clause) => (
          <section key={clause.heading}>
            <h2 className="font-display text-xl sm:text-2xl">{clause.heading}</h2>
            {clause.body.map((paragraph) => (
              <p key={paragraph} className="mt-3 leading-relaxed">
                {paragraph}
              </p>
            ))}
            {clause.heading === 'Changing your mind' && (
              <p className="mt-3 leading-relaxed">{contactSentence()}</p>
            )}
          </section>
        ))}
      </div>

      <p className="mt-12 border-t border-rule pt-6 text-sm leading-relaxed text-muted">
        The version above is recorded on every record at the moment it is submitted, so a
        contribution is always tied to the wording that was actually on the screen. Earlier versions
        are never rewritten.
      </p>
    </article>
  );
}
