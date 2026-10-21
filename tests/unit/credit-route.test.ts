// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ expert: vi.fn(), admin: vi.fn(), download: vi.fn(), upload: vi.fn(), sign: vi.fn(), compose: vi.fn(), thumb: vi.fn(), problem: vi.fn(), item: { status:'accepted', access:'public', deleted_at:null as string|null, collector_name:'Levi', source:'Sara' } }));
vi.mock('@/lib/supabase/server',()=>({getCurrentVolunteer:mocks.expert,getCurrentAdmin:mocks.admin}));
vi.mock('@/lib/supabase/admin',()=>({createAdminSupabase:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{storage_path:'master',preview_path:'preview',mime_type:'image/png',checksum:'sum',items:mocks.item}})})})}),storage:{from:()=>({download:mocks.download,upload:mocks.upload,createSignedUrl:mocks.sign})}})}));
vi.mock('@/lib/files/credit-band',async importOriginal=>({...await importOriginal<typeof import('@/lib/files/credit-band')>(),composeCredit:mocks.compose}));
vi.mock('@/lib/files/rendition',()=>({makeThumb:mocks.thumb}));
vi.mock('@/lib/problems/record',()=>({recordProblem:mocks.problem}));
vi.mock('@/lib/i18n',()=>({getMessages:async()=>({t:(s:string)=>s})}));
const {GET}=await import('@/app/api/files/[fileId]/route');
const request=(query='')=>GET(new NextRequest('https://archive.example/api/files/id'+query),{params:Promise.resolve({fileId:'id'})});
beforeEach(()=>{
  vi.clearAllMocks(); mocks.item.deleted_at=null; mocks.item.status='accepted';
  mocks.expert.mockResolvedValue(null);mocks.admin.mockResolvedValue(null);
  mocks.download.mockImplementation(async(p:string)=>({data:p.startsWith('renditions/')?null:new Blob(['original'])}));
  mocks.compose.mockResolvedValue(Buffer.from('burned'));mocks.thumb.mockResolvedValue(Buffer.from('thumb'));mocks.upload.mockResolvedValue({error:null});mocks.sign.mockResolvedValue({data:{signedUrl:'https://storage.example/master'}});
});
it.each(['','?rendition','?thumb'])('burns public images %s',async(query)=>{
  const response=await request(query);
  expect(await response.text()).toBe('burned');expect(response.headers.get('content-type')).toBe('image/jpeg');
  expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('vary')).toContain('Cookie');
  expect(mocks.compose).toHaveBeenCalledWith(expect.any(Uint8Array),expect.stringContaining('Levi'));
  expect(mocks.download).toHaveBeenCalledWith(query==='?rendition'?'preview':'master');
  expect(mocks.upload.mock.calls[0][0]).toMatch(/^renditions\/credits\//);expect(mocks.sign).not.toHaveBeenCalled();
});
it.each(['','?rendition','?thumb'])('serves untouched master to experts %s',async(query)=>{
  mocks.expert.mockResolvedValue({id:'expert'});const response=await request(query);
  expect(response.status).toBe(307);expect(mocks.sign).toHaveBeenCalledWith('master',600);
  expect(mocks.compose).not.toHaveBeenCalled();expect(mocks.download).not.toHaveBeenCalled();expect(response.headers.get('cache-control')).toBe('private, no-store');
});
it('reuses cached bytes without rendering',async()=>{
  mocks.download.mockResolvedValue({data:new Blob(['cached'])});expect(await (await request()).text()).toBe('cached');expect(mocks.compose).not.toHaveBeenCalled();
});
it('authorizes before looking in cache',async()=>{
  mocks.item.status='pending';expect((await request()).status).toBe(403);expect(mocks.download).not.toHaveBeenCalled();
});
it('logs failed text rendering and serves original bytes without caching',async()=>{
  mocks.compose.mockRejectedValue(new Error('font'));const response=await request();expect(await response.text()).toBe('original');expect(response.headers.get('content-type')).toBe('image/png');expect(mocks.problem).toHaveBeenCalled();expect(mocks.upload).not.toHaveBeenCalled();
});
it('serves burned image even when cache write throws',async()=>{
  mocks.upload.mockRejectedValue(new Error('offline'));expect(await (await request()).text()).toBe('burned');expect(mocks.problem).toHaveBeenCalled();
});
