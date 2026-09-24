'use client';

import { useEffect } from 'react';
import { reportProblem } from '@/lib/problems/report';

/**
 * Reports what fails in the browser without a screen catching it (0031).
 *
 * Mounted once, in the root layout. Five reports per page load at most: a
 * failure inside an animation frame would otherwise report sixty times a
 * second, and the first one is the one that says what happened.
 */
const MAX_PER_PAGE = 5;

export function ProblemListener() {
  useEffect(() => {
    let sent = 0;
    const send = (error: unknown, place: string) => {
      if (sent >= MAX_PER_PAGE) return;
      sent += 1;
      reportProblem(error, place);
    };
    const onError = (event: ErrorEvent) => {
      // A failed <img> or script load arrives here with no error object; the
      // archive's own screens are what this is for.
      if (!event.error && !event.message) return;
      send(event.error ?? event.message, 'window.error');
    };
    const onRejection = (event: PromiseRejectionEvent) => send(event.reason, 'unhandledrejection');
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
