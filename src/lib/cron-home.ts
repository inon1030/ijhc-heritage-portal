import 'server-only';

/**
 * Which deployment runs the nightly jobs.
 *
 * The same code is deployed to two Vercel projects on one database: the main
 * site (heritage-portal-snowy, Inon's account) and the Center's copy, which
 * deploys from GitHub and cannot be configured from Inon's account. Both
 * register the crons in vercel.json, so without a gate every job would run
 * twice - two backups, two translation sweeps, and a reading retry spent on
 * whichever project's Gemini key happens to be blocked.
 *
 * Only the project with CRON_HOME=1 runs them (Inon, 21.10.2026: the main site).
 * Everywhere else the scheduler is answered 200 with `skipped`, so the platform
 * does not report a failure.
 */
export function isCronHome(): boolean {
  return process.env.CRON_HOME === '1';
}
