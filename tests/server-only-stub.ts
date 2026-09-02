/**
 * A stand-in for Next's `server-only` package under Vitest.
 *
 * `server-only` exists to make a build fail loudly if a server module is ever
 * imported into a client bundle. It has no test-runner resolution, so importing
 * a guarded module in a unit test used to fail before a single assertion ran —
 * which left the modules most worth testing, the ones holding secrets, as the
 * only ones with no tests.
 *
 * Aliased in vitest.config.ts. The real guard is untouched in the app build.
 */
export {};
