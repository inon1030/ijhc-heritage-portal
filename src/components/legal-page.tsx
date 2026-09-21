import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getMessages } from '@/lib/i18n';
import { contactAddress } from '@/lib/consent';
import type { LegalDocument } from '@/lib/legal';

/**
 * One renderer for the three documents the archive is required to publish.
 *
 * They are written in English and Hebrew and in no other language: a machine
 * translation of an undertaking is not an undertaking, and this archive marks
 * machine work everywhere else, so it would be strange to hide it here. A
 * reader in Hindi, Marathi or Malayalam is shown the English, and told why.
 */
export async function LegalPage({
  documents,
  officer = false,
}: {
  documents: Record<'en' | 'he', LegalDocument>;
  /** Accessibility statements must name a responsible person. */
  officer?: boolean;
}) {
  const { t, language } = await getMessages();
  const written = language.code === 'he' ? 'he' : 'en';
  const doc = documents[written];
  const contact = contactAddress();
  const officerName = process.env.NEXT_PUBLIC_ACCESSIBILITY_OFFICER?.trim() || null;
  const officerPhone = process.env.NEXT_PUBLIC_ACCESSIBILITY_PHONE?.trim() || null;

  return (
    <article className="mx-auto max-w-2xl px-6 py-12" lang={written} dir={written === 'he' ? 'rtl' : 'ltr'}>
      <Link
        href="/portal"
        className="mb-8 inline-flex h-11 items-center gap-2 rounded-full border border-rule px-4 text-muted transition-colors duration-200 hover:border-accent-strong hover:text-ink"
      >
        <ArrowLeft size={15} className="rtl:rotate-180" /> {t('common.backToPortal')}
      </Link>

      <p className="eyebrow">{doc.updated}</p>
      <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">{doc.title}</h1>
      <p className="mt-4 leading-relaxed text-muted sm:text-lg">{doc.standfirst}</p>

      {written !== language.code && (
        <p className="mt-6 rounded-lg border-s-[3px] border-caution bg-accent-wash px-4 py-3 text-sm leading-relaxed text-caution">
          {t('legal.englishOnly')}
        </p>
      )}

      <div className="mt-10 space-y-9">
        {doc.clauses.map((clause) => (
          <section key={clause.heading}>
            <h2 className="font-display text-xl">{clause.heading}</h2>
            {clause.body.map((paragraph) => (
              <p key={paragraph} className="mt-3 leading-relaxed">
                {paragraph}
              </p>
            ))}
            {clause.list && (
              <ul className="mt-3 space-y-2 ps-5">
                {clause.list.map((line) => (
                  <li key={line} className="list-disc leading-relaxed marker:text-accent">
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section className="rounded-2xl border border-rule bg-paper-2 p-5">
          <h2 className="font-display text-xl">{t('legal.contactHeading')}</h2>
          {officer && (
            <p className="mt-3 leading-relaxed">
              {officerName ? (
                <>
                  {officerName}
                  {officerPhone ? ` · ${officerPhone}` : ''}
                </>
              ) : (
                <span className="text-caution">{doc.missingOfficer}</span>
              )}
            </p>
          )}
          <p className="mt-3 leading-relaxed">
            {contact ? (
              <a className="underline underline-offset-2 hover:text-accent-strong" href={`mailto:${contact}`}>
                {contact}
              </a>
            ) : (
              <span className="text-caution">{doc.missingContact}</span>
            )}
          </p>
        </section>
      </div>
    </article>
  );
}
