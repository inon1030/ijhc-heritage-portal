import Link from 'next/link';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/primitives';
import { FilePreview } from '@/components/file-preview';
import { verifyReceipt } from '@/lib/items/receipt';
import { createAdminSupabase } from '@/lib/supabase/admin';
import type { ItemFile } from '@/lib/types';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Your contribution', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * What happened to the thing you sent.
 *
 * The one page in the archive that is reached by a signature rather than by a
 * session. A contributor is a member of the public with no account, so there is
 * nothing to sign in as; the link they were given at the moment of submission
 * is the whole of their claim to see this.
 *
 * It reads with the service-role client because the record is `pending` and
 * therefore invisible to the anon role — which is exactly why the signature is
 * checked first and the query runs second. What it then shows is deliberately
 * only what its holder already typed, plus the archive's answer.
 */
export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;

  if (!verifyReceipt(id, t)) {
    return (
      <Wrapper>
        <EmptyState
          title="That link is not right"
          body="Contribution links are long and are easily broken by an email client or a chat app. Copy the whole address, including everything after the question mark."
          action={{ href: '/upload', label: 'Contribute something' }}
        />
      </Wrapper>
    );
  }

  const { data } = await createAdminSupabase()
    .from('items')
    .select('title, status, access, created_at, deleted_at, item_files(*)')
    .eq('id', id)
    .maybeSingle();

  if (!data) {
    return (
      <Wrapper>
        <EmptyState
          title="This contribution is no longer held"
          body="The archive no longer has a record under this link. If that is unexpected, get in touch and quote the reference below."
          action={{ href: '/portal', label: 'Browse the archive' }}
        />
      </Wrapper>
    );
  }

  const files = ((data.item_files ?? []) as ItemFile[]).slice(0, 4);
  const state = stateOf(data.status, data.access, data.deleted_at);

  return (
    <Wrapper>
      <p className="eyebrow animate-rise">Your contribution</p>
      <h1 className="animate-rise mt-2 font-display text-3xl leading-tight sm:text-4xl">
        {data.title}
      </h1>
      <p className="machine animate-rise mt-3 text-muted">
        Sent {formatDate(data.created_at)} · reference {id.slice(0, 8)}
      </p>

      {files.length > 0 && (
        <div className="animate-rise mt-8 flex flex-wrap gap-3">
          {files.map((file) => (
            <div key={file.id} className="h-28 w-28 overflow-hidden rounded-lg bg-paper-2">
              <FilePreview file={file} alt="" fit="cover" />
            </div>
          ))}
        </div>
      )}

      <div
        className="animate-rise mt-8 rounded-xl border-l-[3px] px-5 py-4"
        style={{ borderLeftColor: `var(--color-${state.tone})` }}
      >
        <p className="font-display text-xl">{state.title}</p>
        <p className="mt-2 max-w-xl leading-relaxed text-muted">{state.body}</p>
        {state.published && (
          <Link
            href={`/portal/${id}`}
            className="mt-4 inline-flex h-12 items-center rounded-full bg-ink px-6 font-medium text-paper shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-ink-2"
          >
            See it in the archive
          </Link>
        )}
      </div>

      <p className="mt-8 max-w-xl text-sm leading-relaxed text-muted">
        Keep this link if you want to check again later — it does not expire. Anyone you send it to
        can see this page, so treat it the way you would treat the photograph itself. To ask for
        this contribution to be withdrawn, see the{' '}
        <Link href="/handling" className="underline underline-offset-2 hover:text-accent">
          handling terms
        </Link>
        .
      </p>
    </Wrapper>
  );
}

/**
 * Four outcomes, in the contributor's language rather than the schema's.
 *
 * `rejected` never says "rejected". A person sent a family photograph and a
 * volunteer decided it was not for this archive; that is a decision about the
 * archive's scope, not about them, and there is no reason for the word to land
 * the way it lands in the database.
 */
function stateOf(status: string, access: string, deletedAt: string | null) {
  if (deletedAt) {
    return {
      tone: 'muted',
      title: 'Withdrawn',
      body: 'This contribution has been taken out of the archive. If you did not ask for that and it looks wrong, get in touch.',
      published: false,
    };
  }

  if (status === 'accepted' && access === 'public') {
    return {
      tone: 'positive',
      title: 'Published',
      body: 'A volunteer checked it and it is in the public archive.',
      published: true,
    };
  }

  if (status === 'accepted' || status === 'shadow_gallery') {
    return {
      tone: 'accent-strong',
      title: 'Kept, but not public',
      body: 'A volunteer catalogued it and marked it as not for public display. It is held in the archive and available to researchers on request.',
      published: false,
    };
  }

  if (status === 'rejected') {
    return {
      tone: 'muted',
      title: 'Not added to the archive',
      body: 'A volunteer looked at it and decided it falls outside what this archive collects. That is about the archive, not about the material — it is still yours.',
      published: false,
    };
  }

  return {
    tone: 'accent-strong',
    title: 'Waiting for a volunteer',
    body: 'It has arrived safely. Volunteers check each contribution against the original before anything is published, and they are people with day jobs, so this can take a while.',
    published: false,
  };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl px-6 pt-10 pb-20 sm:pt-16">{children}</div>;
}
