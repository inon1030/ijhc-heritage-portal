'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Languages, Loader2, RefreshCw, User } from 'lucide-react';
import { buttonClass } from '@/components/primitives';
import { useMessages } from '@/lib/i18n/provider';

/**
 * The record in every language the archive publishes in, before it goes out.
 *
 * A volunteer used to approve a record having read one language of it. The
 * other four were made afterwards by a machine and went straight to readers, so
 * the one screen whose whole purpose is "a person saw this" was the one screen
 * that could not see most of what was published. This is that gap closed: the
 * languages are tabs, every field is editable, and a correction is kept forever.
 *
 * ── three states, drawn differently on purpose ──────────────────────────────
 *
 * **Missing** is work not done. It is quiet — the original shows through and
 * the reader would see the original too.
 *
 * **Stale** is a line made from text that has since changed. It is the
 * dangerous one, because it reads as finished while describing something nobody
 * wrote any more, so it is the only state that gets a warning colour.
 *
 * **By hand** is a volunteer's own words, marked so the next volunteer knows not
 * to assume a machine wrote it — and so does the translator, which never
 * overwrites it (decision 15).
 *
 * ── it does not translate on its own ────────────────────────────────────────
 *
 * The button is deliberate rather than an effect on mount. Opening a record in
 * the queue would otherwise spend four model calls, and the archive's whole
 * daily allowance is twenty; a volunteer skimming five records would exhaust
 * the day before lunch. Publishing the record translates it anyway, in the
 * background, so the button is for the volunteer who wants to *check* first.
 */

interface FieldState {
  field: string;
  source: string;
  value: string | null;
  by: string | null;
  stale: boolean;
}

interface Language {
  code: string;
  label_en: string;
  label_native: string;
  rtl: boolean;
}

interface Deck {
  languages: Language[];
  fields: string[];
  byLanguage: Record<string, FieldState[]>;
  itemLanguage: string | null;
  made?: string[];
  quota?: boolean;
}

const FIELD_LABEL: Record<string, string> = {
  title: 'review.field.title',
  description: 'review.field.description',
  provenance: 'review.field.provenance',
  period: 'review.field.period',
  origin_place: 'review.field.originPlace',
};

export function TranslationDeck({
  itemId,
  siteLanguage,
}: {
  itemId: string;
  /**
   * The language the site is set to, which is the language this review is in.
   *
   * The deck used to open on whichever language `archive_languages` returned
   * first, so a knowledge expert working in Hebrew set the site to Hebrew, got
   * a Hebrew interface, and then had to click Hebrew again on this panel. The
   * language control at the top is how they choose what they are reviewing in;
   * this is the panel obeying it.
   *
   * It is a *default*, not a lock: the whole purpose of the deck is moving
   * between languages to check them, so the tabs still work.
   */
  siteLanguage: string;
}) {
  const t = useMessages();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  /*
   * The request is held on a ref, not a flag.
   *
   * Strict Mode runs the effect twice, and a boolean "already started" guard
   * defeats itself: the second run sees the flag, returns early, and the first
   * run's cleanup has already thrown the result away — so the panel loads
   * forever. Holding the *promise* means the second run awaits the first one's
   * answer. The archive has made this exact mistake once already, in
   * `translation-request`.
   */
  const inflight = useRef<Promise<Deck | Error> | null>(null);

  useEffect(() => {
    inflight.current ??= (async () => {
      try {
        const res = await fetch(`/api/items/${itemId}/translations`);
        const body = await res.json();
        if (!res.ok || !body.ok) throw new Error(body?.error?.message ?? t('error.languagesUnavailable'));
        return body.data as Deck;
      } catch (e) {
        return e instanceof Error ? e : new Error(String(e));
      }
    })();

    let live = true;
    void inflight.current.then((result) => {
      if (!live) return;
      if (result instanceof Error) {
        setError(result.message);
        return;
      }
      setDeck(result);
      setActive(
        (current) =>
          current ??
          // The site's language when the record has that language at all,
          // and the first one otherwise — a source-language site (English)
          // has no tab of its own here, and an empty panel would be worse
          // than the wrong tab.
          (result.languages.some((l) => l.code === siteLanguage)
            ? siteLanguage
            : (result.languages[0]?.code ?? null)),
      );
    });

    return () => {
      live = false;
    };
    // `t` is memoised on the catalogue and the catalogue cannot change without
    // a reload, so this does not re-run — it is here because the effect reads
    // it and a dependency list that lies is worse than one that is long.
  }, [itemId, t, siteLanguage]);

  const rows = useMemo(() => (active && deck ? (deck.byLanguage[active] ?? []) : []), [active, deck]);
  const language = deck?.languages.find((l) => l.code === active) ?? null;

  /** How many fields of a language are present and current. Drives the tabs. */
  function ready(code: string): { done: number; total: number; stale: number } {
    const list = deck?.byLanguage[code] ?? [];
    return {
      done: list.filter((r) => r.value && !r.stale).length,
      total: list.length,
      stale: list.filter((r) => r.stale).length,
    };
  }

  async function translateNow() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${itemId}/translations`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body?.error?.message ?? t('error.translatorUnreachable'));
      setDeck(body.data);
      setDrafts({});
      if (body.data.quota) setError(t('review.quotaGone'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  }

  async function save(field: string, value: string) {
    if (!active) return;
    setSaving(field);
    setError(null);
    try {
      const res = await fetch(`/api/items/${itemId}/translations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: active, field, value }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body?.error?.message ?? t('error.didNotSave'));
      setDeck(body.data);
      setDrafts((d) => {
        const next = { ...d };
        delete next[`${active}:${field}`];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  if (!deck) {
    return (
      <section className="card p-5">
        <p className="eyebrow flex items-center gap-2 text-muted">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          {t('review.loadingLanguages')}
        </p>
      </section>
    );
  }

  if (deck.languages.length === 0 || deck.fields.length === 0) return null;

  return (
    <section className="card p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl">
            <Languages size={19} aria-hidden className="text-accent" />
            {t('review.languagesHeading')}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t('review.languagesNote')}</p>
        </div>
        <button
          type="button"
          onClick={translateNow}
          disabled={working}
          className={buttonClass('quiet')}
        >
          {working ? (
            <Loader2 size={15} className="animate-spin" aria-hidden />
          ) : (
            <RefreshCw size={15} aria-hidden />
          )}
          {working ? t('review.translating') : t('review.translateMissing')}
        </button>
      </header>

      {error && (
        <p className="mb-4 rounded-lg bg-critical/8 px-4 py-2.5 text-sm text-critical">{error}</p>
      )}

      {/* The tabs carry their own progress, so a knowledge expert can see at a glance
          which language is short without opening each one. */}
      <div role="tablist" aria-label={t('review.languagesHeading')} className="mb-4 flex flex-wrap gap-1.5">
        {deck.languages.map((l) => {
          const { done, total, stale } = ready(l.code);
          const on = l.code === active;
          return (
            <button
              key={l.code}
              role="tab"
              type="button"
              aria-selected={on}
              onClick={() => setActive(l.code)}
              className={[
                'flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors',
                on ? 'border-accent-strong bg-accent-wash font-medium' : 'border-rule text-muted hover:bg-paper-2',
              ].join(' ')}
            >
              <span dir={l.rtl ? 'rtl' : 'ltr'}>{l.label_native}</span>
              <span className="machine text-xs">
                {done}/{total}
              </span>
              {stale > 0 && <AlertTriangle size={13} className="text-caution" aria-hidden />}
              {done === total && stale === 0 && (
                <Check size={13} className="text-sage" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      {language && (
        <div className="space-y-4">
          {rows.map((row) => {
            const key = `${language.code}:${row.field}`;
            const draft = drafts[key] ?? row.value ?? '';
            const dirty = draft !== (row.value ?? '');
            return (
              <div key={row.field}>
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="eyebrow">{t(FIELD_LABEL[row.field] as never)}</span>
                  {row.by === 'human' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sage-wash px-2 py-0.5 text-xs text-sage">
                      <User size={11} aria-hidden />
                      {t('review.byHand')}
                    </span>
                  )}
                  {row.by === 'machine' && !row.stale && (
                    <span className="machine text-xs text-muted">{t('review.byMachine')}</span>
                  )}
                  {row.stale && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-caution/12 px-2 py-0.5 text-xs text-caution">
                      <AlertTriangle size={11} aria-hidden />
                      {t('review.stale')}
                    </span>
                  )}
                  {!row.value && <span className="text-xs text-muted">{t('review.missing')}</span>}
                </div>

                {/* The English above the box, always. Checking a translation
                    without the original in view is proofreading in the dark. */}
                <p className="mb-1.5 rounded-lg bg-paper-2/60 px-3 py-2 text-sm leading-relaxed text-muted">
                  {row.source}
                </p>

                <textarea
                  dir={language.rtl ? 'rtl' : 'ltr'}
                  lang={language.code}
                  rows={row.field === 'description' || row.field === 'provenance' ? 3 : 1}
                  value={draft}
                  onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                  placeholder={t('review.notTranslatedYet')}
                  className="w-full rounded-lg border border-rule bg-paper px-3 py-2 leading-relaxed focus:border-accent-strong focus:outline-none"
                />

                {dirty && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => save(row.field, draft)}
                      disabled={saving === row.field}
                      className={buttonClass('quiet')}
                    >
                      {saving === row.field ? t('review.saving') : t('review.saveCorrection')}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDrafts((d) => {
                          const next = { ...d };
                          delete next[key];
                          return next;
                        })
                      }
                      className="text-sm text-muted hover:text-ink"
                    >
                      {t('review.discard')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
