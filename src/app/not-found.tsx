import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 font-display text-3xl">That record is not here</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        It may still be awaiting review, or it may have been withdrawn from the public archive.
      </p>
      <Link
        href="/portal"
        className="mt-8 inline-block bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:bg-ink-2"
      >
        Back to the portal
      </Link>
    </div>
  );
}
