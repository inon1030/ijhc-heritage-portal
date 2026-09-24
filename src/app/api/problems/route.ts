import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, invalid, ok, readJson } from '@/lib/api';
import { PROBLEM_CODE, pathOnly } from '@/lib/problems/code';
import { recordProblem } from '@/lib/problems/record';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Where a screen reports that it failed (0031).
 *
 * Open to anyone, because most of the people who meet a failure are
 * contributors without an account. That makes it a place a stranger can write
 * to, so it takes only short text, only a well-formed code, and only so many
 * reports from one address a minute. It never answers with anything it holds.
 */

const Body = z.object({
  code: z.string().regex(PROBLEM_CODE),
  place: z.string().max(120).optional(),
  path: z.string().max(2000).nullable().optional(),
  message: z.string().min(1).max(1000),
  detail: z.string().max(4000).nullable().optional(),
});

/** Per server instance. A flood from one address is cut off; a restart forgets it. */
const WINDOW_MS = 60_000;
const PER_WINDOW = 20;
const seen = new Map<string, { at: number; count: number }>();

function tooMany(ip: string): boolean {
  const now = Date.now();
  const entry = seen.get(ip);
  if (!entry || now - entry.at > WINDOW_MS) {
    seen.set(ip, { at: now, count: 1 });
    if (seen.size > 5000) seen.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > PER_WINDOW;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (tooMany(ip)) return fail(429, 'rate_limited', 'Too many reports. Try again in a minute.');

  const parsed = Body.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  let profileId: string | null = null;
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase.auth.getUser();
    profileId = data.user?.id ?? null;
  } catch {
    // An anonymous report is the usual case.
  }

  await recordProblem({
    code: parsed.data.code,
    source: 'browser',
    place: parsed.data.place ?? null,
    path: pathOnly(parsed.data.path),
    message: parsed.data.message,
    detail: parsed.data.detail ?? null,
    userAgent: request.headers.get('user-agent'),
    profileId,
  });

  return ok({ ref: parsed.data.code });
}
