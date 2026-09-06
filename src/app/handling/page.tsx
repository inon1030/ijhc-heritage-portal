import Link from 'next/link';
import { getMessages } from '@/lib/i18n';
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
export default async function HandlingPage({
  searchParams,
}: {
  searchParams: Promise<{ original?: string }>;
}) {
  const { t, language } = await getMessages();
  // `?original=1` is the address of the terms as written — the same pattern a
  // record page uses for the words a family actually used. It has to be a
  // link rather than a toggle so somebody can cite it.
  const english = language.is_source || (await searchParams).original === '1';
  return (
    <article className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href="/portal"
        className="mb-8 inline-flex h-11 items-center gap-2 rounded-full border border-rule px-4 text-muted transition-all duration-200 hover:-translate-x-0.5 hover:border-accent-strong hover:text-ink"
      >
        <ArrowLeft size={15} /> {t('common.backToPortal')}
      </Link>

      <p className="eyebrow">Version {CONSENT_VERSION}</p>
      <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">
        {t('handling.title')}
      </h1>
      <p className="mt-4 leading-relaxed text-muted sm:text-lg">{t('handling.standfirst')}</p>

      {/*
        Said before the terms, not after them.

        The clauses below are translated like everything else, because a
        contributor who cannot read what they are agreeing to has not agreed to
        anything. But `consentVersion` on every submission points at the
        English, and the English is what an earlier version is compared against
        — so the page says which one binds, and links to it, before the reader
        starts reading rather than after.
      */}
      {!language.is_source && (
        <p className="machine mt-6 rounded-lg border-s-[3px] border-caution bg-caution/8 px-4 py-3 text-sm leading-relaxed">
          {t('consent.machineNotice')}{' '}
          <Link href="/handling?original=1" className="underline underline-offset-2">
            {t('consent.readEnglish')}
          </Link>
        </p>
      )}

      <div className="mt-10 space-y-9">
        {CONSENT_CLAUSES.map((clause, index) => (
          <section key={clause.key}>
            <h2 className="font-display text-xl sm:text-2xl">
              {english ? clause.heading : t(`${clause.key}.heading` as never)}
            </h2>
            {clause.body.map((paragraph, n) => (
              <p key={paragraph} className="mt-3 leading-relaxed">
                {english ? paragraph : t(`${clause.key}.p${n + 1}` as never)}
              </p>
            ))}
            {/* Matched on position, not on the English heading — comparing
                against 'Changing your mind' stopped being true the moment the
                heading could be in Hebrew. */}
            {index === CONSENT_CLAUSES.length - 1 && (
              <p className="mt-3 leading-relaxed">{contactSentence()}</p>
            )}
          </section>
        ))}
      </div>

      <p className="mt-12 border-t border-rule pt-6 text-sm leading-relaxed text-muted">
        {t('handling.versionNote')}
      </p>
    </article>
  );
}
