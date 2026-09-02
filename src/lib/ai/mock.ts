import type { AIProvider, AnalysisInput, AnalysisResult } from './types';

/**
 * The fallback when no GEMINI_API_KEY is set, so the app still runs end to end.
 *
 * Everything it returns is fabricated, `isSimulated` is true, and the UI is
 * required to label it. The Bolt demo produced output exactly like this and
 * presented it as genuine AI findings — including GPS coordinates it made up
 * with Math.random. This provider deliberately returns no technical metadata at
 * all: size, dimensions and duration are measured from the real file elsewhere.
 */

export function createMockProvider(): AIProvider {
  return {
    id: 'mock',
    model: 'simulated',
    isSimulated: true,

    async analyze(input: AnalysisInput): Promise<AnalysisResult> {
      await new Promise((r) => setTimeout(r, 600));

      return {
        provider: 'mock',
        model: 'simulated',
        summary:
          'Simulated analysis. No AI model examined this file. Connect a GEMINI_API_KEY to get a real description, transcription, and keyword set.',
        keywords: [],
        newTerms: [],
        // Nothing clears the gate, because nothing was looked at.
        fields: [],
        suggestedCategory: null,
        language: null,
        confidence: 0,
        ocrText: null,
        transcript: null,
        suggestedCommunity: null,
        // It looked at nothing, so it accuses nothing.
        offTopic: false,
        offTopicReason: null,
        suggestedPeriod: null,
        suggestedOrigin: null,
        reasoning: null,
        evidence: null,
        raw: { simulated: true, fileName: input.fileName },
      };
    },
  };
}
