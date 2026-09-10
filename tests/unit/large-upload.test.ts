import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * How a two-hour recording reaches the model.
 *
 * `generateContent` carries at most twenty megabytes of request and base64
 * costs a third on top of the bytes, so a file much over twelve megabytes does
 * not arrive at all. The archive's own cap is fifty, which an m4a interview
 * reaches at around fifty minutes — so every oral history longer than roughly a
 * quarter of an hour was accepted, stored, and then refused by the model, and
 * the contributor was told the analysis service had not responded.
 *
 * That failure is invisible from the outside and expensive to reproduce by
 * hand: it needs a real long recording and a real model call, which on the free
 * tier is one of twenty a day. So it is pinned here instead.
 */

const generateContent = vi.fn();
const upload = vi.fn();
const get = vi.fn();
const remove = vi.fn();

vi.mock('@google/genai', async () => {
  const actual = await vi.importActual<typeof import('@google/genai')>('@google/genai');
  return {
    ...actual,
    GoogleGenAI: class {
      models = { generateContent };
      files = { upload, get, delete: remove };
    },
  };
});

vi.stubEnv('GEMINI_API_KEY', 'test-key');

const { createGeminiProvider } = await import('@/lib/ai/gemini');
const { FileState } = await import('@google/genai');

const reading = {
  text: JSON.stringify({
    summary: 'An interview.',
    keywords: [],
    fields: [],
    transcript: 'She was born in Bombay.',
  }),
  candidates: [{ finishReason: 'STOP' }],
};

const analyse = (byteSize: number, mimeType = 'audio/mpeg') =>
  createGeminiProvider().analyze({
    bytes: new Uint8Array(byteSize),
    mimeType,
    fileName: 'interview.mp3',
    title: 'Interview with my grandmother',
  });

/** Whatever the model was actually handed, on the first call. */
const partSent = () => generateContent.mock.calls[0][0].contents[0].parts[0];

beforeEach(() => {
  generateContent.mockReset().mockResolvedValue(reading);
  upload.mockReset();
  get.mockReset();
  remove.mockReset().mockResolvedValue(undefined);
});

describe('the file, on its way to the model', () => {
  it('sends a photograph inline and uploads nothing', async () => {
    await analyse(2 * 1024 * 1024, 'image/jpeg');

    expect(upload).not.toHaveBeenCalled();
    expect(partSent()).toHaveProperty('inlineData');
  });

  it('uploads a long recording and sends a reference to it', async () => {
    upload.mockResolvedValue({
      name: 'files/abc123',
      state: FileState.ACTIVE,
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123',
      mimeType: 'audio/mpeg',
    });

    await analyse(20 * 1024 * 1024);

    expect(upload).toHaveBeenCalledTimes(1);
    // The request is now a reference, not sixty megabytes of base64.
    expect(partSent()).toMatchObject({
      fileData: { fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123' },
    });
    expect(partSent()).not.toHaveProperty('inlineData');
  });

  it('does not re-fetch an upload that already came back ready', async () => {
    upload.mockResolvedValue({
      name: 'files/abc123',
      state: FileState.ACTIVE,
      uri: 'https://example.test/files/abc123',
      mimeType: 'audio/mpeg',
    });

    await analyse(20 * 1024 * 1024);

    expect(get).not.toHaveBeenCalled();
  });

  it('waits for a recording Google is still transcoding', async () => {
    upload.mockResolvedValue({ name: 'files/slow', state: FileState.PROCESSING });
    get.mockResolvedValue({
      name: 'files/slow',
      state: FileState.ACTIVE,
      uri: 'https://example.test/files/slow',
      mimeType: 'audio/mpeg',
    });

    await analyse(20 * 1024 * 1024);

    expect(get).toHaveBeenCalled();
    expect(partSent()).toMatchObject({ fileData: { fileUri: 'https://example.test/files/slow' } });
  });

  it('says so plainly when the recording cannot be read at all', async () => {
    upload.mockResolvedValue({ name: 'files/bad', state: FileState.PROCESSING });
    get.mockResolvedValue({ name: 'files/bad', state: FileState.FAILED });

    await expect(analyse(20 * 1024 * 1024)).rejects.toThrow(/could not be read/i);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('takes the copy back out of Google’s store afterwards', async () => {
    // Unpublished, unreviewed, in most cases not yet even submitted — this is
    // family material, and leaving it in a third party's file store for the
    // forty-eight hours it would otherwise sit there is not the archive's to do.
    upload.mockResolvedValue({
      name: 'files/abc123',
      state: FileState.ACTIVE,
      uri: 'https://example.test/files/abc123',
      mimeType: 'audio/mpeg',
    });

    await analyse(20 * 1024 * 1024);

    expect(remove).toHaveBeenCalledWith({ name: 'files/abc123' });
  });

  it('takes it back out even when the reading failed', async () => {
    upload.mockResolvedValue({
      name: 'files/abc123',
      state: FileState.ACTIVE,
      uri: 'https://example.test/files/abc123',
      mimeType: 'audio/mpeg',
    });
    generateContent.mockRejectedValue(Object.assign(new Error('bad request'), { status: 400 }));

    await expect(analyse(20 * 1024 * 1024)).rejects.toThrow();
    expect(remove).toHaveBeenCalledWith({ name: 'files/abc123' });
  });

  it('uploads once for the whole fallback chain, not once per model', async () => {
    upload.mockResolvedValue({
      name: 'files/abc123',
      state: FileState.ACTIVE,
      uri: 'https://example.test/files/abc123',
      mimeType: 'audio/mpeg',
    });
    const exhausted = Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
    generateContent.mockRejectedValueOnce(exhausted).mockResolvedValueOnce(reading);

    await analyse(20 * 1024 * 1024);

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('refuses a reading that ran out of room instead of parsing half of it', async () => {
    // A schema-constrained answer that hits the output ceiling does not come
    // back short — it comes back as JSON with no closing brace, and the
    // SyntaxError reaches the contributor as an internal error.
    generateContent.mockResolvedValue({
      text: '{"summary":"An interview.","transcript":"She was born in Bom',
      candidates: [{ finishReason: 'MAX_TOKENS' }],
    });

    await expect(analyse(1024, 'image/jpeg')).rejects.toThrow(/longer than one answer can hold/i);
  });
});

/**
 * What the chain survives.
 *
 * The free tier's allowance is counted per model, so the chain is the archive's
 * whole capacity: seven distinct models is a hundred and forty readings a day
 * where one model is twenty. That makes two things worth pinning.
 *
 * **A model that is gone must not take the archive with it.** Measured on
 * 08.09.2026: `gemini-2.5-flash` and `gemini-2.5-flash-lite` are still returned
 * by `models.list` and answer `generateContent` with 404. A name in the chain is
 * a name Google can retire between two deploys.
 *
 * **A real error must still be a real error.** A fallback that swallowed
 * everything would turn one malformed request into seven wasted calls and the
 * same failure, and would hide a bad key behind "no model was able to answer".
 */
describe('the fallback chain', () => {
  const refusal = (status: number, message: string) =>
    Object.assign(new Error(message), { status });

  beforeEach(() => {
    generateContent.mockReset();
  });

  it('moves past a model Google has withdrawn', async () => {
    generateContent
      .mockRejectedValueOnce(refusal(404, 'models/gemini-x is no longer available'))
      .mockResolvedValueOnce(reading);

    await expect(analyse(1024, 'image/jpeg')).resolves.toMatchObject({ provider: 'gemini' });
    expect(generateContent).toHaveBeenCalledTimes(2);

    const asked = generateContent.mock.calls.map((call) => call[0].model);
    expect(new Set(asked).size).toBe(2);
  });

  it('moves past a model that is out of allowance', async () => {
    generateContent
      .mockRejectedValueOnce(refusal(429, 'RESOURCE_EXHAUSTED'))
      .mockResolvedValueOnce(reading);

    await expect(analyse(1024, 'image/jpeg')).resolves.toMatchObject({ provider: 'gemini' });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('does not spend the chain on a request that is simply wrong', async () => {
    // A malformed request, a bad key, a file the model refuses on policy — none
    // of those is fixed by asking a different model.
    generateContent.mockRejectedValue(refusal(400, 'INVALID_ARGUMENT'));

    await expect(analyse(1024, 'image/jpeg')).rejects.toThrow(/INVALID_ARGUMENT/);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('keeps asking while models remain, and reports the one that answered', async () => {
    generateContent
      .mockRejectedValueOnce(refusal(429, 'RESOURCE_EXHAUSTED'))
      .mockRejectedValueOnce(refusal(404, 'no longer available'))
      .mockRejectedValueOnce(refusal(429, 'RESOURCE_EXHAUSTED'))
      .mockResolvedValueOnce(reading);

    const result = await analyse(1024, 'image/jpeg');

    expect(generateContent).toHaveBeenCalledTimes(4);
    // `ai_analyses.model` is how a knowledge expert knows what read their
    // record; recording the preferred model after three refused would make the
    // archive wrong about its own provenance.
    expect(result.model).toBe(generateContent.mock.calls[3][0].model);
  });
});
