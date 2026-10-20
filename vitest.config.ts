import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    // The suite renders whole screens (upload, review); with 63 files in parallel on a
    // busy machine a few pass alone in 2s and miss the 5s default. Assertions are unchanged.
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(configDirectory, './src'),
      // See tests/server-only-stub.ts: the guard has no test-runner resolution,
      // so without this the server modules holding secrets are the only ones
      // that cannot be unit tested.
      'server-only': path.resolve(configDirectory, './tests/server-only-stub.ts'),
    },
  },
});
