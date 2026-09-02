import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export type ApiError = { code: string; message: string; fields?: Record<string, string> };
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
 */
export function unexpected(error: unknown) {
  console.error('[api]', error);
  return fail(500, 'internal_error', 'Something went wrong on our side. Try again.');
}
