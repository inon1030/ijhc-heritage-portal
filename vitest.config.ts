import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // See tests/server-only-stub.ts: the guard has no test-runner resolution,
      // so without this the server modules holding secrets are the only ones
      // that cannot be unit tested.
      'server-only': path.resolve(__dirname, './tests/server-only-stub.ts'),
    },
  },
});
