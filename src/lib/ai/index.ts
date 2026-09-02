import { aiProviderId } from '@/lib/env';
import { createGeminiProvider } from './gemini';
import { createMockProvider } from './mock';
import type { AIProvider } from './types';

export type { AIProvider, AnalysisInput, AnalysisResult } from './types';

let cached: AIProvider | null = null;

/**
 * The single seam through which the product talks to any AI vendor.
 *
 * Swapping engines — to OpenAI, or to whatever NotebookLM exposes — means
 * writing one more file in this folder and setting AI_PROVIDER. No route
 * handler, component, or table changes.
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;
  cached = aiProviderId() === 'gemini' ? createGeminiProvider() : createMockProvider();
  return cached;
}

/** Test seam. */
export function __setAIProvider(provider: AIProvider | null) {
  cached = provider;
}
