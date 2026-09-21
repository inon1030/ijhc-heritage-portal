'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useMessages } from '@/lib/i18n/provider';

/**
 * A guide you click through: the real screen on one side, the instruction on
 * the other, and a ring around the one place to click.
 *
 * The screenshots are of the live site, captured by `scripts/guides/capture.mjs`,
 * which also measured where each control sits - so the ring is drawn from the
 * element's own box, as a percentage of the picture, and lands on the button
 * at any width the picture is shown at.
 *
 * No animation beyond the ring appearing. Arrow keys move between steps once
 * the guide has focus, and the step counter is announced.
 */

export interface Spot {
  /** Percentages of the screenshot's width and height. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WalkStep {
  id: string;
  title: string;
  body: string;
  image: string;
  width: number;
  height: number;
  spots: Spot[];
}

export function Walkthrough({ steps, label }: { steps: WalkStep[]; label: string }) {
  const t = useMessages();
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = steps.length - 1;

  // The next picture is fetched while this one is read, so "Next" never waits.
  useEffect(() => {
    const next = steps[index + 1];
    if (next) new Image().src = next.image;
  }, [index, steps]);

  if (!step) return null;

  return (
    <section
      aria-label={label}
      tabIndex={0}
      onKeyDown={(e) => {
        const forward = document.documentElement.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
        const back = forward === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
        if (e.key === forward) setIndex((i) => Math.min(i + 1, last));
        if (e.key === back) setIndex((i) => Math.max(i - 1, 0));
      }}
      className="grid gap-6 rounded-[var(--radius-card)] bg-surface p-4 sm:p-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] lg:gap-8"
    >
      <figure className="m-0">
        <div className="relative overflow-hidden rounded-2xl border border-rule bg-paper">
          {/* eslint-disable-next-line @next/next/no-img-element -- a signed redirect, not an optimisable asset */}
          <img
            src={step.image}
            alt={step.title}
            width={step.width}
            height={step.height}
            className="block h-auto w-full"
            data-full
          />
          {step.spots.map((spot, i) => (
            <span
              key={i}
              aria-hidden
              className="pointer-events-none absolute rounded-xl"
              style={{
                left: `${spot.x}%`,
                top: `${spot.y}%`,
                width: `${spot.w}%`,
                height: `${spot.h}%`,
                boxShadow: '0 0 0 3px var(--color-accent-strong), 0 0 0 9px rgb(217 119 6 / 0.22)',
              }}
            />
          ))}
        </div>
      </figure>

      <div className="flex flex-col">
        <p className="eyebrow" aria-live="polite">
          {t('guides.step', { current: index + 1, total: steps.length })}
        </p>
        <h3 className="mt-2 text-2xl font-light tracking-tight">{step.title}</h3>
        <p className="mt-3 leading-relaxed text-muted">{step.body}</p>

        <div className="mt-auto flex items-center gap-2 pt-6">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(i - 1, 0))}
            disabled={index === 0}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-rule-strong bg-paper px-5 font-medium transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            <ArrowLeft size={17} aria-hidden className="rtl:rotate-180" />
            {t('guides.back')}
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(i + 1, last))}
            disabled={index === last}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 font-medium text-white transition-colors hover:bg-primary-strong disabled:opacity-40"
          >
            {t('guides.next')}
            <ArrowRight size={17} aria-hidden className="rtl:rotate-180" />
          </button>
        </div>

        <ol className="mt-5 flex flex-wrap gap-1.5" aria-label={t('guides.allSteps')}>
          {steps.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index ? 'step' : undefined}
                aria-label={`${i + 1}. ${s.title}`}
                className={[
                  'h-2.5 w-6 rounded-full transition-colors',
                  i === index ? 'bg-accent-strong' : 'bg-rule-strong hover:bg-muted',
                ].join(' ')}
              />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
