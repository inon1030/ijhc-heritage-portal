/**
 * Serves the archive on a public address from this machine, and keeps it there.
 *
 *   npm run public
 *
 * This is the stopgap, not the destination — `npm run deploy` is. A quick
 * tunnel hands out a fresh random hostname every time it starts, so the address
 * changes whenever this stops, and it only lives as long as the laptop is awake.
 *
 * What it does do is survive the things that actually killed it: the server
 * crashing, the tunnel dropping its connection, the network coming back after a
 * sleep. Both processes are watched and restarted, and the current address is
 * printed whenever it changes so there is never any doubt what to send.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const NEXT_BIN = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');

const CLOUDFLARED = [
  'C:/Program Files (x86)/cloudflared/cloudflared.exe',
  'C:/Program Files/cloudflared/cloudflared.exe',
  'cloudflared',
].find((candidate) => candidate === 'cloudflared' || existsSync(candidate));

if (!existsSync(path.join(ROOT, '.next'))) {
  console.error('No production build yet. Run `npm run build` first.');
  process.exit(1);
}

if (!CLOUDFLARED) {
  console.error('cloudflared is not installed. Install it, or use `npm run deploy` instead.');
  process.exit(1);
}

let address = null;
let stopping = false;

/** Restarts anything that exits, with a small backoff so a crash loop is visible. */
function keep(name, command, args, onLine) {
  let attempt = 0;

  const start = () => {
    if (stopping) return;

    const child = spawn(command, args, { cwd: ROOT });

    const read = (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) onLine(line);
      }
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);

    child.on('exit', (code) => {
      if (stopping) return;
      attempt += 1;
      const wait = Math.min(30_000, 2_000 * attempt);
      console.log(`\n[${name}] stopped (${code}). Restarting in ${wait / 1000}s…`);
      setTimeout(start, wait);
    });

    // A run that lasts a minute counts as healthy, so a later failure starts
    // its backoff from scratch rather than from the last bad patch.
    setTimeout(() => {
      attempt = 0;
    }, 60_000);
  };

  start();
}

/**
 * Is something already serving on 3000?
 *
 * This script restarts the server whenever it exits, so two copies fight over
 * the port forever: one binds, the other retries, and killing the shell that
 * launched them leaves the watcher running. That happened — seven accumulated
 * and kept re-taking the port the instant it was freed.
 *
 * So: look first. If the archive is already up, tunnel to it rather than
 * starting a second one.
 */
async function alreadyServing() {
  try {
    const response = await fetch('http://localhost:3000/portal', {
      signal: AbortSignal.timeout(2500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const running = await alreadyServing();

console.log(
  running
    ? 'The archive is already serving on port 3000. Tunnelling to it.\n'
    : 'Starting the archive and its tunnel. Ctrl+C stops both.\n',
);

// Next is started directly rather than through `npm start`: npm on Windows is
// a .cmd, which Node 24 refuses to spawn without a shell, and spawning through
// a shell is what Node warns about. One fewer layer settles both.
if (!running) {
  keep('server', process.execPath, [NEXT_BIN, 'start'], (line) => {
    if (/Ready in|Local:|Error/i.test(line)) console.log(`[server] ${line.trim()}`);
  });
}

/**
 * Waits until the address actually answers before announcing it.
 *
 * A quick tunnel prints its hostname the moment it is assigned, which is before
 * the name exists in DNS — and sometimes it never does: the process stays up,
 * the banner looks right, and every request fails. That happened once while
 * this was being written. Printing an address that does not work is worse than
 * printing nothing, because the first person to find out is whoever you sent
 * it to.
 */
async function answersYet(candidate) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      const response = await fetch(`${candidate}/portal`, { redirect: 'follow' });
      if (response.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}

function announce(candidate) {
  console.log(
    [
      '',
      '  ┌────────────────────────────────────────────────────────────┐',
      '  │  The archive is reachable from anywhere at:                │',
      '  └────────────────────────────────────────────────────────────┘',
      '',
      `      ${candidate}`,
      '',
      '  Checked: it answers. It changes every time the tunnel restarts, and it',
      '  only works while this window is open. For an address that does not,',
      '  run:',
      '',
      '      npm run deploy',
      '',
    ].join('\n'),
  );
}

keep('tunnel', CLOUDFLARED, ['tunnel', '--url', 'http://localhost:3000', '--no-autoupdate'], (line) => {
  const found = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (found && found[0] !== address) {
    address = found[0];
    const candidate = address;
    console.log(`
  Tunnel assigned ${candidate}. Checking that it answers…`);

    void answersYet(candidate).then((live) => {
      if (address !== candidate) return;
      if (live) return announce(candidate);
      console.log(
        [
          '',
          `  ${candidate} never came up.`,
          '',
          '  Cloudflare occasionally assigns a quick-tunnel name that never',
          '  registers in DNS. Stop with Ctrl+C and run this again for another.',
          '',
        ].join('\n'),
      );
    });
  }
  if (/ERR|failed/i.test(line) && !/Retrying/i.test(line)) console.log(`[tunnel] ${line.trim()}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    console.log('\nStopping.');
    process.exit(0);
  });
}
