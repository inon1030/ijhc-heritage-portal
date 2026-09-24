import { NextResponse, after } from 'next/server';
import { ZodError } from 'zod';
import { describeThrown, problemCode } from '@/lib/problems/code';
import { recordProblem } from '@/lib/problems/record';

export type ApiError = { code: string; message: string; fields?: Record<string, string>; ref?: string };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiResult<T>>({ ok: true, data }, init);
}

export function fail(status: number, code: string, message: string, fields?: Record<string, string>) {
  return NextResponse.json<ApiResult<never>>(
    { ok: false, error: { code, message, ...(fields ? { fields } : {}) } },
    { status },
  );
}

export function invalid(error: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fail(400, 'invalid_request', 'Some fields need attention.', fields);
}

/**
 * Turns anything thrown into a safe response. Database errors carry table and
 * column names, so they are logged but never sent to the browser.
 *
 * It also leaves a trace (0031): one row in `problems`, written after the
 * response has gone, and the row's short code in the answer as `ref` and at
 * the end of the message. The person sees "... (E-7KQ2WX)", quotes it in the
 * bug sheet, and the report is one query away instead of a day of
 * reconstruction (Rafi, 24.09.2026).
 */
export function unexpected(error: unknown, place?: string) {
  console.error('[api]', place ?? '', error);
  const code = problemCode();
  const { message, detail } = describeThrown(error);
  const write = () => recordProblem({ code, source: 'server', place: place ?? null, message, detail });
  try {
    after(write);
  } catch {
    // Outside a request (a script, a test) there is no `after`. Best effort.
    void write();
  }
  return NextResponse.json<ApiResult<never>>(
    {
      ok: false,
      error: { code: 'internal_error', message: `Something went wrong on our side. Try again. (${code})`, ref: code },
    },
    { status: 500 },
  );
}

/**
 * The request body, parsed — or `undefined` if it was not JSON at all.
 *
 * `request.json()` throws on a body that is empty or malformed, and every route
 * called it inside the `try` that turns anything thrown into `unexpected`. So a
 * request the *client* got wrong was answered as a server error: measured on
 * production, a POST with no body returned 500 from five separate routes, and
 * a real failure would have been indistinguishable from them in the log.
 *
 * Returning `undefined` rather than throwing lets the route's own schema
 * reject it, so a malformed body is reported in the same shape as a missing
 * field — one 400, one `fields` object, nothing special to handle.
 */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
