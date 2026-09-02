import { describe, expect, it } from 'vitest';
import { createMockProvider } from '@/lib/ai/mock';

describe('mock AI provider', () => {
  const provider = createMockProvider();

  it('declares itself simulated so the UI can say so', () => {
    expect(provider.isSimulated).toBe(true);
    expect(provider.id).toBe('mock');
  });

  it('invents no technical metadata at all', async () => {
    const result = await provider.analyze({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/jpeg',
      fileName: 'ketubah.jpg',
      title: 'Ketubah',
    });

    // The demo fabricated GPS around 19N 72E and a resolution, then showed both
    // as if read from the file. Nothing here may look like a measurement.
    expect(result.language).toBeNull();
    expect(result.ocrText).toBeNull();
    expect(result.transcript).toBeNull();
    expect(result.suggestedCommunity).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/\d+\.\d+\s*[NE]/);
  });

  it('reports zero confidence, because it did not look at anything', async () => {
    const result = await provider.analyze({
      bytes: new Uint8Array(),
      mimeType: 'image/png',
      fileName: 'x.png',
      title: 'x',
    });
    expect(result.confidence).toBe(0);
    expect(result.summary).toMatch(/simulated/i);
  });
});
