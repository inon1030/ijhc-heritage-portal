/**
 * Puts the archive on a permanent address.
 *
 *   npx vercel login      once, by you — see below
 *   npm run deploy        everything else
 *
 * Why the login is yours and not mine: the account owns the deployment, the
 * domain and the billing relationship. Somebody has to be the person Vercel
 * emails, and it is not the machine that wrote the code.
 *
 * Everything after that is here. The tedious part of a first deploy is copying
 * eight secrets into a web form one at a time and getting one of them subtly
 * wrong; this reads them from `.env.local`, which already works, and pushes
 * them. Then it deploys, learns the address it landed on, feeds that back as
 * NEXT_PUBLIC_SITE_URL so the share card's links resolve, and deploys again.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/** Server-only secrets and the public settings the browser needs. */
const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
];

const OPTIONAL = [
  'AI_PROVIDER',
  'GEMINI_MODEL',
  'NEXT_PUBLIC_ARCHIVE_CONTACT',
  // Without it in production the nightly translation sweep refuses every
  // request — which is the safe failure, and a silent one, so it is pushed.
  'CRON_SECRET',
];

function readEnvLocal() {
  const file = path.join(ROOT, '.env.local');
  if (!existsSync(file)) {
    console.error('No .env.local. Nothing to deploy with.');
    process.exit(1);
  }

  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      }),
  );
}

function vercel(args, { input, quiet = false } = {}) {
  const result = spawnSync('npx', ['vercel', ...args], {
    cwd: ROOT,
    input,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (!quiet && result.stdout?.trim()) console.log(result.stdout.trim());
  return result;
}

// ── 1. is anyone logged in? ─────────────────────────────────────────────────
const who = vercel(['whoami'], { quiet: true });
if (who.status !== 0) {
  console.error(
    [
      '',
      'Not signed in to Vercel yet. That is the one step that has to be yours:',
      '',
      '    npx vercel login',
      '',
      'It opens a browser. Sign in with email or GitHub — the free tier is enough',
      'for this — then run `npm run deploy` again and the rest happens on its own.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}
console.log(`Signed in as ${who.stdout.trim()}.\n`);

// ── 2. env vars ─────────────────────────────────────────────────────────────
const env = readEnvLocal();
const missing = REQUIRED.filter((key) => !env[key]);
if (missing.length) {
  console.error(`.env.local is missing: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('Pushing environment variables to production…');
for (const key of [...REQUIRED, ...OPTIONAL]) {
  const value = env[key];
  if (!value) continue;

  // Remove first so a re-run updates rather than colliding. A miss is fine:
  // it only means the variable was not there yet.
  vercel(['env', 'rm', key, 'production', '--yes'], { quiet: true });
  const added = vercel(['env', 'add', key, 'production'], { input: `${value}\n`, quiet: true });
  console.log(`  ${added.status === 0 ? '✓' : '✗'} ${key}`);
}

// ── 3. deploy ───────────────────────────────────────────────────────────────
console.log('\nDeploying…');
const deployed = vercel(['--prod', '--yes'], { quiet: true });
if (deployed.status !== 0) {
  console.error(deployed.stderr || deployed.stdout);
  process.exit(1);
}

const deploymentUrl = (deployed.stdout.match(/https:\/\/[^\s]+\.vercel\.app/g) ?? []).pop();
if (!deploymentUrl) {
  console.error('Deployed, but the address could not be read back:', deployed.stdout);
  process.exit(1);
}

/**
 * The address to hand out.
 *
 * Two traps here, and the first cost a wrong link.
 *
 * `vercel --prod` prints the *deployment* URL, which carries a build hash and
 * differs every time. Sending that to someone sends them a snapshot: it keeps
 * working, but it stops being the current archive the moment you deploy again.
 *
 * And not every alias is public. A team-scoped one redirects to Vercel's SSO,
 * so it looks like a working address to anyone already signed in and is a login
 * wall to everybody else — including the person you sent it to. It is also the
 * shorter of the two, which is exactly the one a "pick the tidiest" rule would
 * choose.
 *
 * So each candidate is fetched and only an address that answers on its own,
 * without a redirect to a sign-in, is offered.
 */
async function publicAlias() {
  const listed = vercel(['alias', 'ls'], { quiet: true }).stdout ?? '';
  const candidates = [
    ...new Set(
      [...listed.matchAll(/([a-z0-9-]+\.vercel\.app)/g)]
        .map((match) => match[1])
        // Deployment URLs carry a hash segment; aliases do not.
        .filter((host) => !/-[a-z0-9]{8,}-/.test(host)),
    ),
  ];

  for (const host of candidates) {
    const address = `https://${host}`;
    try {
      const response = await fetch(`${address}/portal`, { redirect: 'manual' });
      if (response.status === 200) return address;
      console.log(`  ${host} is not public (${response.status}) — skipping.`);
    } catch {
      console.log(`  ${host} did not answer — skipping.`);
    }
  }

  return deploymentUrl;
}

console.log('\nChecking which address is publicly reachable…');
const url = await publicAlias();

// ── 4. tell the app its own address, and go again ───────────────────────────
// The share card's image URL has to be absolute, and until now nothing knew
// what the address would be.
if (env.NEXT_PUBLIC_SITE_URL !== url) {
  console.log(`\nRecording the address (${url}) and redeploying so the share card resolves…`);
  vercel(['env', 'rm', 'NEXT_PUBLIC_SITE_URL', 'production', '--yes'], { quiet: true });
  vercel(['env', 'add', 'NEXT_PUBLIC_SITE_URL', 'production'], { input: `${url}\n`, quiet: true });
  vercel(['--prod', '--yes'], { quiet: true });
}

console.log(
  [
    '',
    '  The archive is live at:',
    '',
    `      ${url}`,
    '',
    '  Permanent, served from Vercel rather than this laptop, and reachable from',
    '  any phone anywhere. Send that one.',
    '',
    '  Run `npm run deploy` again after any change.',
    '',
  ].join('\n'),
);

