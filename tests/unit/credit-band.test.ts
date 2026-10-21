// @vitest-environment node
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { creditName, creditText, escapePango } from '@/lib/files/credit-text';
import { composeCredit, creditCachePath, renderCredit } from '@/lib/files/credit-band';
import { en, format } from '@/lib/i18n/messages';
import he from '@/lib/i18n/locales/he.json';

describe('credit text', () => {
  it.each([
    [null, null, '© Indian Jewish Heritage Center'],
    ['Levi', null, '© Levi collection · Indian Jewish Heritage Center'],
    [null, 'Sara', 'Shared by Sara · © Indian Jewish Heritage Center'],
    ['Levi', 'Sara', '© Levi collection · Shared by Sara · Indian Jewish Heritage Center'],
    [' ', '\n', '© Indian Jewish Heritage Center'],
  ])('builds %s / %s', (collector, source, result) => expect(creditText(collector, source)).toBe(result));
  it('preserves Hebrew names and translates labels by hand', () => {
    expect(creditText('לוי', 'שרה')).toContain('© לוי collection · Shared by שרה');
    expect(creditText('לוי', 'שרה', (key, vars) => format((he as Record<string,string>)[key] ?? en[key], vars))).toBe('© אוסף לוי · שותף על ידי שרה · מרכז מורשת יהדות הודו');
  });
  it('escapes user markup once', () => expect(escapePango('A & <B> "C"')).toBe('A &amp; &lt;B&gt; &quot;C&quot;'));
  it('truncates unicode names without splitting surrogate pairs', () => expect(creditName('😀'.repeat(60), 48)).toBe('😀'.repeat(47)+'…'));
  it('removes control characters and keeps full page names', () => {
    expect(creditName(' A\nB\u202e ')).toBe('A B');
    expect(creditText('a'.repeat(100))).toContain('a'.repeat(100));
  });
});

describe('band', () => {
  it.each([[159, 100, 100], [160, 100, 118], [800, 1000, 1040], [800, 2000, 2048]])('composes %ipx x %ipx', async (width, height, expectedHeight) => {
    const input = await sharp({create:{width,height,channels:3,background:'#bf0000'}}).png().toBuffer();
    const output = await composeCredit(input, creditText('לוי', 'שרה'));
    const meta = await sharp(output).metadata();
    expect(meta).toMatchObject({width,height:expectedHeight,format:'jpeg'});
    const {data,info}=await sharp(output).raw().toBuffer({resolveWithObject:true});
    expect(data[0]).toBeGreaterThan(150); // original subject still present
    if(width>=160) {
      const offset=((info.height-1)*width)*info.channels;
      expect(data[offset]).toBeGreaterThan(230); // light paper only
    }
  });
  it('renders real Hebrew glyph pixels to a temporary PNG', async () => {
    const dir=await mkdtemp(path.join(process.cwd(),'tests','credit-glyph-'));
    try {
      const png=await renderCredit('שלום עולם',300,40);
      const file=path.join(dir,'hebrew.png');
      await sharp(png).toFile(file);
      expect((await stat(file)).size).toBeGreaterThan(100);
      const {data,info}=await sharp(file).raw().toBuffer({resolveWithObject:true});
      let ink=0;
      for(let i=3;i<data.length;i+=info.channels) if(data[i]>0) ink++;
      expect(ink).toBeGreaterThan(30);
      expect(ink).toBeLessThan(info.width*info.height);
    } finally { await rm(dir,{recursive:true,force:true}); }
  });
  it('invalidates derivatives for changed credit, checksum, path or variant', () => {
    const values=[creditCachePath('id','sum','path','full','A'),creditCachePath('id','sum','path','full','B'),creditCachePath('id','sum2','path','full','A'),creditCachePath('id','sum','path2','full','A'),creditCachePath('id','sum','path','thumb','A')];
    expect(new Set(values).size).toBe(5);
    expect(values.every(v=>v.startsWith('renditions/credits/'))).toBe(true);
  });
});

it('places the band below the EXIF-oriented image, flattening transparent pixels to paper', async () => {
  const original=await sharp({create:{width:200,height:300,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).withMetadata({orientation:6}).png().toBuffer();
  const output=await composeCredit(original,creditText());
  expect(await sharp(output).metadata()).toMatchObject({width:300,height:218,format:'jpeg'});
  const {data}=await sharp(output).raw().toBuffer({resolveWithObject:true});
  expect(data[0]).toBeGreaterThan(240);
});
