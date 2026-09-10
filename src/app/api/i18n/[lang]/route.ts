import { NextRequest } from 'next/server';
import { fail, ok, unexpected } from '@/lib/api';
import { getMessages, resolve } from '@/lib/i18n';
import { listLanguages } from '@/lib/translate/languages';

/**
 * One language's interface catalogue, for a screen that is not in the site's
 * language.
 *
 * ── why this exists at all ──────────────────────────────────────────────────
 *
 * Almost everywhere, the interface language is the site's language and the
 * root layout serialises that one catalogue into the page. There is exactly one
 * screen where the two come apart: the contribution flow lets a contributor
 * choose which language the machine should read their document *in*, and the
 * pre-review that follows belongs to that choice rather than to whatever the
 * site happens to be set to. A Marathi speaker at an English kiosk asks for a
 * Marathi reading and must be able to check it in Marathi.
 *
 * Fetched rather than shipped: five catalogues in every page would be five
 * times the payload on every route in the archive, to serve a case that arises
 * on one screen and only when the contributor changes the default.
 *
 * ── it holds nothing private ────────────────────────────────────────────────
 *
 * These are the words on the buttons. They are already in the HTML of every
 * page in the site's own language, they are checked into the repository, and
 * they are the same for everyone — so this is public, unauthenticated, and
 * cached hard. It reads no database row belonging to anybody.
 *
 * The language is checked against `archive_languages` rather than against the
 * files, so a code that is not published cannot be probed for and the answer to
 * "which languages exist" stays the one the archive gives everywhere else.
 */

export const revalidate = 3600;

export async function GET(_request: NextRequest, context: { params: Promise<{ lang: string }> }) {
  const { t } = await getMessages();

  try {
    const { lang } = await context.params;

    const known = await listLanguages().catch(() => []);
    if (!known.some((language) => language.code === lang)) {
      return fail(404, 'unknown_language', t('err.unknownLanguage'));
    }

    return ok(
      { lang, catalogue: resolve(lang) },
      {
        headers: {
          // A deploy changes these and nothing else does. Immutable within a
          // build, and the build is what the URL is really keyed on.
          'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
      },
    );
  } catch (error) {
    return unexpected(error);
  }
}
