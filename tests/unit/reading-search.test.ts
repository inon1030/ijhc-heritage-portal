import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Web search on top of the reading, and what happens when Google says no.
 *
 * Measured on 21.09.2026 on the free tier: the same photograph and the same
 * model answered normally without search and 429 on every model with it. That
 * is the case pinned here — search refused must cost the contributor nothing.
 */

const generateContent = vi.fn();

vi.mock('@google/genai', async () => {
  const actual = await vi.importActual<typeof import('@google/genai')>('@google/genai');
  return {
    ...actual,
    GoogleGenAI: class {
      models = { generateContent };
      files = { upload: vi.fn(), get: vi.fn(), delete: vi.fn() };
    },
  };
});

vi.stubEnv('GEMINI_API_KEY', 'test-key');

const { createGeminiProvider, resetSearchPause } = await import('@/lib/ai/gemini');

const answer = (extra: Record<string, unknown> = {}) => ({
  text: JSON.stringify({ summary: 'A ketubah.', keywords: [], fields: [], background: 'Likely Cochin, 1920s.' }),
  candidates: [{ finishReason: 'STOP', ...extra }],
});

const quota = Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });

const analyse = () =>
  createGeminiProvider().analyze({
    bytes: new Uint8Array(10),
    mimeType: 'image/jpeg',
    fileName: 'ketuba.jpg',
    title: '',
  });

const usedSearch = (call: number) => Boolean(generateContent.mock.calls[call][0].config.tools);

beforeEach(() => {
  generateContent.mockReset();
  resetSearchPause();
});

describe('reading with web search', () => {
  it('asks with search first and returns the pages it used', async () => {
    generateContent.mockResolvedValue(
      answer({
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: 'https://example.org/cochin', title: 'example.org' } },
            { web: { uri: 'javascript:alert(1)', title: 'bad' } },
          ],
        },
      }),
    );

    const result = await analyse();

    expect(usedSearch(0)).toBe(true);
    expect(result.background).toBe('Likely Cochin, 1920s.');
    expect(result.backgroundSources).toEqual([{ title: 'example.org', url: 'https://example.org/cochin' }]);
    expect((result.raw as { backgroundSources: unknown }).backgroundSources).toEqual(result.backgroundSources);
  });

  it('reads without search when search is refused, and stops asking for it', async () => {
    generateContent.mockImplementation(async (request: { config: { tools?: unknown } }) => {
      if (request.config.tools) throw quota;
      return answer();
    });

    const first = await analyse();
    expect(first.summary).toBe('A ketubah.');
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(usedSearch(0)).toBe(true);
    expect(usedSearch(1)).toBe(false);

    // The next upload does not spend a round trip hearing the same no.
    generateContent.mockClear();
    await analyse();
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(usedSearch(0)).toBe(false);
  });

  it('goes on without search when the search attempt runs out of time', async () => {
    generateContent.mockImplementation(async (request: { config: { tools?: unknown; abortSignal?: AbortSignal } }) => {
      if (request.config.tools) {
        expect(request.config.abortSignal).toBeInstanceOf(AbortSignal);
        throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
      }
      return answer();
    });

    const result = await analyse();
    expect(result.summary).toBe('A ketubah.');
    expect(usedSearch(1)).toBe(false);
  });

  it('does not hide a fault that is not about search', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('bad key'), { status: 401 }));
    await expect(analyse()).rejects.toThrow('bad key');
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
