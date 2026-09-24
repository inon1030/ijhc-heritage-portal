import { describe, expect, it } from 'vitest';
import { correctionOf } from '@/lib/items/correction';

/*
 * Tirza, 22.09.2026: the machine misread an inscription and there was nowhere
 * to fix it. What is sent is only what the contributor actually changed.
 */
describe('a contributor correcting the reading', () => {
  const machine = { ocrText: 'Kenesseth Eliyahoo 1942', transcript: null };

  it('sends the text they changed', () => {
    expect(correctionOf(machine, { ocrText: 'Keneseth Eliyahoo 1924' })).toEqual({
      ocrText: 'Keneseth Eliyahoo 1924',
      transcript: null,
    });
  });

  it('sends nothing when they left it as the machine wrote it', () => {
    expect(correctionOf(machine, { ocrText: '  Kenesseth Eliyahoo 1942 \n' })).toBeNull();
    expect(correctionOf(machine, undefined)).toBeNull();
  });

  it('does not treat clearing the box as a correction', () => {
    expect(correctionOf(machine, { ocrText: '   ' })).toBeNull();
  });

  it('has nothing to correct without a reading', () => {
    expect(correctionOf(null, { ocrText: 'anything' })).toBeNull();
    expect(correctionOf(machine, { transcript: 'a transcript the machine never made' })).toBeNull();
  });
});
