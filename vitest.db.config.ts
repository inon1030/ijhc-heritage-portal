import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

/**
 * The database suite, kept apart from `npm run verify` on purpose.
 *
 * These tests write to whatever `.env.local` points at, which today is
 * production. They must be a deliberate act — `npm run test:db` — not something
 * that happens on every commit. See the header of tests/db/archive.test.ts.
 */
config({ path: '.env.local' });

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/db/**/*.test.ts'],
    // One at a time: they share a database, and a parallel run would have two
    // files inserting and deleting marker rows underneath each other.
    fileParallelism: false,
    testTimeout: 30_000,
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
