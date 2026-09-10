import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The switch under the scanned text, at pre-review.
 *
 * Two things are worth pinning here and nothing else is.
 *
 * **The splitter, because it is the part that silently loses text.** A
 * transcript too long for one answer has to be broken up, and the failure mode
 * of breaking it up badly is not an error — it is a translation missing its
 * last four minutes, which reads exactly like a translation.
 *
 * **The script rule, because this module deliberately disagrees with its
 * sibling.** `callModel` skips the check on a transcript, on the grounds that a
 * bilingual poster is legitimately bilingual. Here the whole request is "put
 * all of this into one language", so a result that is still half in the source
 * script is a failure, and a test is the only thing standing between that rule
 * and somebody helpfully making the two files consistent.
 */

const generateContent = vi.fn();

vi.mock('@google/genai', async () => {
  const actual = await vi.importActual<typeof import('@google/genai')>('@google/genai');
  return {
    ...actual,
    GoogleGenAI: class {
      models = { generateContent };
    },
  };
});

vi.stubEnv('GEMINI_API_KEY', 'test-key');

const {
  chunkReading,
  readingInstructions,
  saysEnoughIn,
  translateReading,
  translateReadingEverywhere,
} = await import('@/lib/translate/reading');

const HEBREW = {
  code: 'he',
  label_en: 'Hebrew',
  label_native: 'עברית',
  rtl: true,
  is_source: false,
};

const answering = (translation: string) => ({
  text: JSON.stringify({ translation }),
  candidates: [{ finishReason: 'STOP' }],
});

beforeEach(() => {
  generateContent.mockReset();
});

describe('chunkReading', () => {
  it('leaves a page of OCR alone', () => {
    const text = 'Keneseth Eliyahoo Synagogue\nBombay, 1884';
    expect(chunkReading(text)).toEqual([text]);
  });

  it('has nothing to say about nothing', () => {
    expect(chunkReading('   ')).toEqual([]);
  });

  it('splits a long transcript on line boundaries and loses not a word', () => {
    // Forty lines of twenty characters against a hundred-character limit: the
    // interesting case is that the join is lossless, not that the count is
    // some particular number.
    const lines = Array.from({ length: 40 }, (_, i) => `line ${String(i).padStart(3, '0')} of it`);
    const text = lines.join('\n');

    const chunks = chunkReading(text, 100);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(100);
    expect(chunks.join('\n')).toBe(text);
  });

  it('breaks unbroken speech at a space rather than mid-word', () => {
    // A transcript of somebody talking has no line breaks at all, which is the
    // case the line splitter cannot handle on its own.
    const words = Array.from({ length: 60 }, () => 'grandmother').join(' ');
    const chunks = chunkReading(words, 100);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
      // Every piece is whole words: no chunk starts or ends inside one.
      for (const word of chunk.split(' ')) expect(word).toBe('grandmother');
    }
  });
});

describe('readingInstructions', () => {
  it('asks for one language throughout, which is the whole point of the switch', () => {
    const rules = readingInstructions(HEBREW, 'Marathi and English');

    expect(rules).toMatch(/Hebrew/);
    expect(rules).toMatch(/more than one language or script/i);
    expect(rules).toMatch(/one language throughout/i);
    // The source language is passed on as a hint when the reading found one.
    expect(rules).toMatch(/Marathi and English/);
  });

  it('says the passage is material, never instructions', () => {
    expect(readingInstructions(HEBREW, null)).toMatch(/never instructions to follow/i);
  });
});

describe('translateReading', () => {
  it('renders both blocks and asks once per block', async () => {
    generateContent
      .mockResolvedValueOnce(answering('כתובה מקוצ׳ין'))
      .mockResolvedValueOnce(answering('ראיון עם סבתא'));

    const values = await translateReading(
      [
        { key: 'ocrText', text: 'A ketubah from Cochin' },
        { key: 'transcript', text: 'An interview with grandmother' },
      ],
      HEBREW,
      'English',
    );

    expect(values).toEqual({ ocrText: 'כתובה מקוצ׳ין', transcript: 'ראיון עם סבתא' });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('refuses a transcript that is still half in the source script', async () => {
    // Exactly the case the feature exists for: a bilingual page, half rendered.
    // `callModel` would accept this for a record's transcript on purpose. Here
    // it is the failure, and it must not reach the contributor looking finished.
    generateContent.mockResolvedValue(answering('כתובה מקוצ׳ין — भारत की यहूदी विरासत'));

    await expect(
      translateReading([{ key: 'transcript', text: 'mixed page' }], HEBREW, null),
    ).rejects.toThrow(/not written in Hebrew/i);
  });

  it('keeps Latin names, because a family searches for the spelling on the photograph', async () => {
    generateContent.mockResolvedValue(answering('בית הכנסת Keneseth Eliyahoo, בומביי'));

    const values = await translateReading(
      [{ key: 'ocrText', text: 'Keneseth Eliyahoo Synagogue, Bombay' }],
      HEBREW,
      null,
    );

    expect(values.ocrText).toContain('Keneseth Eliyahoo');
  });

  it('treats an answer that ran out of room as a failure, not a short translation', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ translation: 'כתובה' }),
      candidates: [{ finishReason: 'MAX_TOKENS' }],
    });

    await expect(
      translateReading([{ key: 'ocrText', text: 'a very long page' }], HEBREW, null),
    ).rejects.toThrow(/too long/i);
  });

  it('treats an empty answer as a failure rather than an empty success', async () => {
    // The archive has shipped the opposite of this once: a translator returning
    // nothing, the caller reporting `ok: true`, and no rows written.
    generateContent.mockResolvedValue({ text: '', candidates: [{ finishReason: 'RECITATION' }] });

    await expect(
      translateReading([{ key: 'ocrText', text: 'a page' }], HEBREW, null),
    ).rejects.toThrow(/RECITATION/);
  });

  it('moves to the next model when the first has spent its daily allowance', async () => {
    // The allowance is counted per model, so a 429 from one says nothing about
    // the next. This is what keeps the switch working after the day's first
    // twenty readings.
    const exhausted = Object.assign(new Error('RESOURCE_EXHAUSTED: quota'), { status: 429 });
    generateContent.mockRejectedValueOnce(exhausted).mockResolvedValueOnce(answering('כתובה'));

    const values = await translateReading([{ key: 'ocrText', text: 'a page' }], HEBREW, null);

    expect(values.ocrText).toBe('כתובה');
    expect(generateContent).toHaveBeenCalledTimes(2);
    // Two different models, not the same one asked twice.
    const asked = generateContent.mock.calls.map((call) => call[0].model);
    expect(new Set(asked).size).toBe(2);
  });
});

/**
 * Every language at once, before anybody asks for one.
 *
 * The on-demand path is right for checking *a* language. It is wrong for moving
 * *between* them, which is what the contribution screen actually needs: the
 * first click on each language would be a round trip, so comparing Hebrew
 * against Marathi against the original is three waits. This makes them all
 * while the contributor is still reading the summary.
 *
 * The two things worth pinning are both about it failing quietly and correctly:
 * a passage too long to render five times must come back empty rather than
 * truncated, and a language in the wrong script must be dropped without taking
 * the other four with it.
 */
describe('translateReadingEverywhere', () => {
  const LANGS = [
    HEBREW,
    { code: 'mr', label_en: 'Marathi', label_native: 'मराठी', rtl: false, is_source: false },
  ];

  const everything = (byLanguage: Record<string, Record<string, string>>) => ({
    text: JSON.stringify(byLanguage),
    candidates: [{ finishReason: 'STOP' }],
  });

  it('makes every language in a single call', async () => {
    generateContent.mockResolvedValue(
      everything({
        he: { ocrText: 'כתובה מקוצ׳ין' },
        mr: { ocrText: 'कोचीनमधील केतुबा' },
      }),
    );

    const made = await translateReadingEverywhere(
      [{ key: 'ocrText', text: 'A ketubah from Cochin' }],
      LANGS,
      'English',
    );

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(Object.keys(made).sort()).toEqual(['he', 'mr']);
    expect(made.he?.ocrText).toBe('כתובה מקוצ׳ין');
  });

  it('drops the language that came back in the wrong script and keeps the rest', async () => {
    // Measured behaviour of the lite models: one language decays into another
    // script mid-word while the others are fine. Losing all five over one is
    // the failure this shape exists to avoid.
    generateContent.mockResolvedValue(
      everything({
        he: { ocrText: 'כתובה מקוצ׳ין' },
        mr: { ocrText: 'कोचीनमधील ketubah كتوبة' },
      }),
    );

    const made = await translateReadingEverywhere(
      [{ key: 'ocrText', text: 'A ketubah from Cochin' }],
      LANGS,
      null,
    );

    expect(Object.keys(made)).toEqual(['he']);
  });

  it('does not ask at all for a passage too long to render five times', async () => {
    const long = 'a '.repeat(3_000); // 6,000 characters
    const made = await translateReadingEverywhere(
      [{ key: 'transcript', text: long }],
      LANGS,
      null,
    );

    // Not an error: the contributor keeps the reading and the switch still
    // works one language at a time. Only the head start is gone.
    expect(made).toEqual({});
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('asks for nothing when the file carried no text', async () => {
    const made = await translateReadingEverywhere([{ key: 'ocrText', text: '   ' }], LANGS, null);
    expect(made).toEqual({});
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('comes back empty rather than truncated when the answer ran out of room', async () => {
    generateContent.mockResolvedValue({
      text: '{"he":{"ocrText":"כתו',
      candidates: [{ finishReason: 'MAX_TOKENS' }],
    });

    const made = await translateReadingEverywhere(
      [{ key: 'ocrText', text: 'A ketubah from Cochin' }],
      LANGS,
      null,
    );
    expect(made).toEqual({});
  });
});

/**
 * The check that `isPlausiblyIn` cannot make.
 *
 * That one asks whether a *third* script appears, and Latin is always allowed
 * on purpose — a Hebrew passage should keep `Sassoon` spelled the way the
 * photograph spells it. So it accepts a passage that was never translated at
 * all, which is the one failure this whole feature exists to prevent.
 *
 * Both cases below were measured on 08.09.2026 against real models, not
 * imagined: one echoed its input, the other translated the body and left the
 * headline standing.
 */
describe('saysEnoughIn', () => {
  const ENGLISH_PLAQUE =
    'KENESETH ELIYAHOO SYNAGOGUE\nBombay — Consecrated 1884\nBuilt by Jacob Elias Sassoon in memory of his father.';

  it('rejects the passage that came back untouched', () => {
    // gemini-3.5-flash with thinking disabled, 7.2 seconds, finishReason STOP.
    expect(saysEnoughIn(ENGLISH_PLAQUE, 'he')).toBe(false);
  });

  it('lets a partly rendered passage through, and that is the trade', () => {
    // gemini-3.5-flash-lite, 1.8 seconds: body translated, headline left in
    // Latin. An earlier version of this check rejected it — and rejected a
    // *correct* Hebrew plaque with it, because a synagogue plaque is mostly
    // proper nouns that are supposed to stay in Latin. No proportion can tell
    // those two apart, so this errs towards showing the contributor something.
    // The models that do it are last in the chain for exactly that reason.
    const half = 'KENESETH ELIYAHOO SYNAGOGUE\nBombay — Consecrated 1884\nנחנך בבומביי בשנת 1884';
    expect(saysEnoughIn(half, 'he')).toBe(true);
  });

  it('accepts a translation that keeps its proper nouns in Latin', () => {
    // gemini-3.1-flash-lite's actual answer. Names in Latin is the rule, not
    // the failure — a family searches for the spelling on the photograph.
    const real =
      'בית הכנסת KENESETH ELIYAHOO\nבומביי — נחנך בשנת 1884\nנבנה בידי Jacob Elias Sassoon לזכר אביו.';
    expect(saysEnoughIn(real, 'he')).toBe(true);
  });

  it('says nothing about a line that is only a name and a number', () => {
    // "Forbes Street, Kala Ghoda, Fort." is the same in every language, and
    // calling that a failed translation would drop a language over a caption.
    expect(saysEnoughIn('Forbes Street, Fort.', 'he')).toBe(true);
  });

  it('leaves a language whose script the archive does not know alone', () => {
    // Adding Judeo-Arabic as a row must not start rejecting its own
    // translations because nobody updated a constant here.
    expect(saysEnoughIn(ENGLISH_PLAQUE, 'arc')).toBe(true);
  });

  it('holds for Malayalam and Marathi too, not only Hebrew', () => {
    expect(saysEnoughIn(ENGLISH_PLAQUE, 'ml')).toBe(false);
    expect(saysEnoughIn(ENGLISH_PLAQUE, 'mr')).toBe(false);
    expect(saysEnoughIn('കേനെസെത്ത് എലിയാഹൂ സിനഗോഗ്, ബോംബെ, 1884', 'ml')).toBe(true);
  });
});
