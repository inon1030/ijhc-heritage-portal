import type { Metadata } from 'next';
import { UploadFlow } from '@/components/upload-flow';

export const metadata: Metadata = {
  title: 'Contribute',
  description:
    'Add a photograph, document, or recording to the Indian Jewish Heritage Center archive.',
};

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 pt-8 pb-14 sm:pt-12 sm:pb-16">
      <header className="mb-10 max-w-xl sm:mb-12">
        <p className="eyebrow animate-rise">Open to everyone — no account needed</p>
        <h1 className="animate-rise mt-3 font-display text-3xl leading-tight sm:text-5xl">
          Contribute an item
        </h1>
        <p
          className="animate-rise mt-4 leading-relaxed text-muted sm:text-lg"
          style={{ '--reveal-delay': '90ms' } as React.CSSProperties}
        >
          A photograph, a document, a recording. The archive reads what it can from the file and
          suggests a description — a volunteer checks all of it before anything is published.
        </p>
      </header>
      <UploadFlow />
    </div>
  );
}
