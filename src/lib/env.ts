/**
 * Environment access, in one place, validated once.
 *
 * Client-visible values are read directly from `process.env` so Next can inline
 * them at build time. Server-only secrets are read lazily and throw a useful
 * message rather than producing an undefined that fails somewhere far away.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export function serviceRoleKey(): string {
  return required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** 'gemini' when a key is present, otherwise the clearly-labelled simulator. */
export function aiProviderId(): 'gemini' | 'mock' {
  const explicit = process.env.AI_PROVIDER;
  if (explicit === 'gemini' || explicit === 'mock') return explicit;
  return process.env.GEMINI_API_KEY ? 'gemini' : 'mock';
}

export function geminiApiKey(): string {
  return required('GEMINI_API_KEY', process.env.GEMINI_API_KEY);
}

// Verified against the live API on 2026-08-19. gemini-2.5-flash is listed by
// the models endpoint but refuses new API keys, so it is not a safe default.
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';
