import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { sendMail } from '@/lib/mail';
import { problemMail } from '@/lib/mail/templates';
import type { ProblemRow } from './record';

/**
 * Mail about a fault, the moment it happens (Inon, 30.09.2026).
 *
 * Every problem already becomes a row in `problems`, and an administrator can
 * read the log - but only if they think to look. A fault nobody is told about
 * is a fault that waits for a contributor to report it, and most contributors
 * do not report, they leave. So each one is also sent as mail.
 *
 * ── it will not flood ───────────────────────────────────────────────────────
 *
 * The reason to be careful is the same reason to send at all: one broken
 * deployment can throw on every request. Two limits, both measured against the
 * rows themselves rather than memory, because a serverless function remembers
 * nothing between invocations:
 *
 *   the same fault, again   the first message of a burst is sent, and the rest
 *                           are not, for as long as the same text keeps
 *                           arriving (REPEAT_MINUTES).
 *   a storm                 above STORM_ROWS faults in an hour, nothing is
 *                           sent at all. Whoever needs to know already does,
 *                           and the log has every one of them.
 *
 * ── it never throws ─────────────────────────────────────────────────────────
 *
 * It runs inside a failure. Anything that goes wrong here is logged and
 * swallowed: a mail server that is down must not turn one fault into two.
 */

const REPEAT_MINUTES = 15;
const STORM_ROWS = 30;
/** Long enough for Gmail on a good day, short enough not to hold an error response. */
const SEND_TIMEOUT_MS = 6_000;

/** Who hears about faults. Empty - the ordinary state of a test run - means nobody. */
export function alertAddresses(): string[] {
  return (process.env.PROBLEM_ALERT_EMAIL ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
}

/**
 * Should this one be sent, given what the log already holds?
 *
 * Pure, so the rule can be tested without a database: `sameRecently` counts
 * rows with the same message inside the window (this one included), and
 * `lastHour` counts everything.
 */
export function shouldAlert(sameRecently: number, lastHour: number): boolean {
  if (lastHour > STORM_ROWS) return false;
  return sameRecently <= 1;
}

export async function alertOnProblem(row: ProblemRow): Promise<void> {
  const to = alertAddresses();
  if (!to.length) return;

  try {
    const supabase = createAdminSupabase();
    const since = new Date(Date.now() - REPEAT_MINUTES * 60_000).toISOString();
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();

    const [{ count: sameRecently }, { count: lastHour }] = await Promise.all([
      supabase
        .from('problems')
        .select('id', { count: 'exact', head: true })
        .eq('message', row.message.slice(0, 1000))
        .gte('created_at', since),
      supabase.from('problems').select('id', { count: 'exact', head: true }).gte('created_at', hourAgo),
    ]);

    if (!shouldAlert(sameRecently ?? 1, lastHour ?? 1)) return;

    const mail = problemMail(to.join(', '), {
      code: row.code,
      source: row.source,
      place: row.place ?? null,
      path: row.path ?? null,
      message: row.message,
      detail: row.detail ?? null,
    });

    await Promise.race([
      sendMail(mail),
      new Promise((resolve) => setTimeout(resolve, SEND_TIMEOUT_MS)),
    ]);
  } catch (error) {
    console.error('[problems] alert not sent:', error);
  }
}
