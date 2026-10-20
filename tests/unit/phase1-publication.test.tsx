import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextRequest } from 'next/server';
import { ReviewWorkbench } from '@/components/review-workbench';
import type { ItemDetail } from '@/lib/types';
import { POST } from '@/app/api/items/[id]/review/route';
const mocks=vi.hoisted(()=>({review:vi.fn(),volunteer:vi.fn(async()=>({id:'expert'}))}));
vi.mock('@/lib/items/mutations',()=>({reviewItem:mocks.review,binItem:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({getCurrentVolunteer:mocks.volunteer}));
vi.mock('@/lib/i18n',()=>({getMessages:async()=>({t:()=> 'יש לבחור קטגוריה לפני הפרסום.'})}));
vi.mock('@/lib/vocabulary/load',()=>({readVocabulary:async()=>[]}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn(),refresh:vi.fn()})}));
vi.mock('@/components/translation-deck',()=>({TranslationDeck:()=>null}));
vi.mock('@/components/file-preview',()=>({FilePreview:()=>null}));
const body={status:'accepted',title:'Record',description:null,community:null,provenance:null,keywords:[],language:null,period:null,originPlace:null,access:'public'};
const item={id:'one',title:'Record',status:'pending',category:null,community:null,keywords:[],contributor_keywords:[],access:'public',files:[],file:null,fields:[],analysis:null,contributor:null} as unknown as ItemDetail;
beforeEach(()=>mocks.review.mockReset());
it('refuses acceptance without a category before any mutation, in the requested language',async()=>{
  const response=await POST(new NextRequest('https://example.test/api/items/one/review',{method:'POST',body:JSON.stringify(body)}),{params:Promise.resolve({id:'one'})});
  expect(response.status).toBe(400);
  expect((await response.json()).error.message).toBe('יש לבחור קטגוריה לפני הפרסום.');
  expect(mocks.review).not.toHaveBeenCalled();
});
it('allows a catalogued request to reach the existing mutation path',async()=>{
  mocks.review.mockResolvedValue({ok:false,code:'not_found',message:'missing'});
  await POST(new NextRequest('https://example.test/api/items/one/review',{method:'POST',body:JSON.stringify({...body,category:'documents'})}),{params:Promise.resolve({id:'one'})});
  expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({category:'documents',status:'accepted'}));
});
it.each(['pending','accepted'] as const)('disables %s publication until a category is chosen',status=>{
  const {container}=render(<ReviewWorkbench item={{...item,status}} vocabulary={[]} families={[]} selectedFamilyIds={[]} siteLanguage="en"/>);
  const button=screen.getByRole('button',{name:status==='accepted'?'Save catalogue changes':'Publish'});
  expect(button).toBeDisabled();
  expect(screen.getByText('Choose a category before publishing.')).toBeInTheDocument();
  fireEvent.change(container.querySelector('select')!,{target:{value:'documents'}});
  expect(button).toBeEnabled();
});

