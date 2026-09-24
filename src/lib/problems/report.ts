'use client';

import { describeThrown, pathOnly, problemCode } from './code';

/**
 * Tells the server a screen failed, and returns the code to show the person.
 *
 * The code is made here rather than by the server so that it can be shown at
 * once, and shown even when the report itself cannot get through — the person
 * still has something to quote, and a missing row is itself a finding.
 * `keepalive` lets the report outlive a page that is navigating away.
 */
export function reportProblem(error: unknown, place: string, code: string = problemCode()): string {
  const { message, detail } = describeThrown(error);
  try {
    void fetch('/api/problems', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        code,
        place,
        path: pathOnly(typeof location === 'undefined' ? null : location.href),
        message,
        detail,
      }),
    }).catch(() => {});
  } catch {
    // Reporting is best effort; the code is shown either way.
  }
  return code;
}
