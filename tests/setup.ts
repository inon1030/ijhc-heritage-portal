import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
// Same reason as testTimeout in vitest.config.ts: findBy/waitFor get 5s instead of 1s.
configure({ asyncUtilTimeout: 5_000 });
