import { COMMUNITY_COLORS } from '@/lib/communities';
import { type Community } from '@/lib/types';
import { getMessages } from '@/lib/i18n';
import { communityKey } from '@/lib/i18n/labels';

/**
 * A community's colour and name, in the reader's language.
 *
 * It lives here rather than in `primitives` because it is the only one of them
 * that needs the server: naming a community means reading the catalogue, and
 * the catalogue reads a cookie. `primitives` is imported by six client
 * components, so a `server-only` import inside it drags `next/headers` and the
 * service-role Supabase client into the browser bundle — which is exactly what
 * the `import 'server-only'` guard exists to turn into a build error, and did.
 */
/** A community's colour and name. The colour is the only place it appears. */
export async function CommunityMark({ community }: { community: Community | null }) {
  const { t } = await getMessages();
  if (!community) {
    return <span className="text-muted italic">{t('streams.communityNotIdentified')}</span>;
  }
  return (
    <span className="inline-flex items-center gap-2.5 rounded-full bg-paper-2 py-1.5 pr-4 pl-3 font-medium ring-1 ring-rule">
      <span
        aria-hidden
        className="h-3 w-3 shrink-0 rounded-full ring-2 ring-paper"
        style={{ backgroundColor: COMMUNITY_COLORS[community], boxShadow: `0 0 0 3.5px ${COMMUNITY_COLORS[community]}22` }}
      />
      {t(communityKey(community))}
    </span>
  );
}
