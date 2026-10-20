import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { PortalFilters } from '@/components/portal-filters';
import { RelatedValue } from '@/components/related-value';
import { MessagesProvider } from '@/lib/i18n/provider';
import { facetOptions } from '@/lib/items/portal-facets';
import he from '@/lib/i18n/locales/he.json';
import { PrimaryNav } from '@/components/site-nav';

const navigation = vi.hoisted(() => ({ query:'',push:vi.fn() }));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(navigation.query),useRouter:()=>({push:navigation.push}),usePathname:()=>'/portal'}));
const options = facetOptions([]);
options.keyword=[{value:'כתובה & חתונה',label:'כתובה & חתונה',count:2}];
options.period=[{value:'1900s',label:'1900s',count:3}];
options.community=[{value:'cochin',label:'cochin',count:3}];
options.category=[{value:'documents',label:'documents',count:3}];
beforeEach(()=>{navigation.query='';navigation.push.mockClear();});

it('keeps combined filters in the URL and resets pagination',()=>{
  navigation.query='q=Ezra&page=4&community=cochin';
  render(<PortalFilters view="grid" options={options} shown={2} total={2} />);
  fireEvent.change(screen.getByLabelText('Period'),{target:{value:'1900s'}});
  const url=new URL(navigation.push.mock.calls[0][0],'https://example.test');
  expect(url.searchParams.get('q')).toBe('Ezra');
  expect(url.searchParams.get('community')).toBe('cochin');
  expect(url.searchParams.get('period')).toBe('1900s');
  expect(url.searchParams.has('page')).toBe(false);
});
it('resynchronizes search text after back navigation and removes only the chosen chip',()=>{
  navigation.query='q=Ezra&period=1900s';
  const {rerender}=render(<PortalFilters view="grid" options={options} shown={2} total={2} />);
  fireEvent.change(screen.getByLabelText('Search the archive by any word'),{target:{value:'Unsaved text'}});
  navigation.query='q=Bombay&period=1900s';
  rerender(<PortalFilters view="grid" options={options} shown={2} total={2} />);
  expect(screen.getByLabelText('Search the archive by any word')).toHaveValue('Bombay');
  fireEvent.click(screen.getByRole('button',{name:'Remove filter: Period'}));
  expect(navigation.push.mock.calls[0][0]).toContain('q=Bombay');
  expect(navigation.push.mock.calls[0][0]).not.toContain('period=');
});
it('has visible Hebrew labels for every new control and preserves the exact keyword',()=>{
  navigation.query='keyword='+encodeURIComponent('כתובה & חתונה');
  render(<MessagesProvider catalogue={he}><div dir="rtl"><PortalFilters view="list" options={options} shown={2} total={2} /></div></MessagesProvider>);
  expect(screen.getByLabelText('מילת מפתח / תגית')).toHaveValue('כתובה & חתונה');
  expect(screen.getByText('סינון מתקדם').closest('details')).toHaveAttribute('open');
  for(const button of screen.getAllByRole('button')) expect(button.textContent?.trim().length).toBeGreaterThan(0);
});
it('only makes a value a link when another published record shares it',()=>{
  const props={filter:'keyword',value:'כתובה & חתונה',label:'All records tagged כתובה',children:'כתובה'};
  const {rerender}=render(<RelatedValue {...props} count={0}/>);
  expect(screen.queryByRole('link')).toBeNull();
  rerender(<RelatedValue {...props} count={1}/>);
  expect(new URL(screen.getByRole('link').getAttribute('href')!,'https://example.test').searchParams.get('keyword')).toBe(props.value);
});
it('uses FolderPlus and the new contribution name in both navigation layouts',()=>{
  const {rerender}=render(<PrimaryNav layout="bar"/>);
  expect(screen.getByRole('link',{name:'Add to the archive now'}).querySelector('.lucide-folder-plus')).not.toBeNull();
  rerender(<MessagesProvider catalogue={he}><PrimaryNav layout="panel"/></MessagesProvider>);
  expect(screen.getByRole('link',{name:'הוסיפו לארכיון עכשיו'})).toHaveAttribute('href','/upload');
});
it('can export an offline Hebrew layout fixture for measured browser inspection',()=>{
  navigation.query='keyword='+encodeURIComponent('כתובה & חתונה')+'&period=1900s';
  const html=renderToStaticMarkup(<MessagesProvider catalogue={he}><main dir="rtl" className="mx-auto max-w-7xl px-6 py-6"><PrimaryNav layout="panel"/><PortalFilters view="grid" options={options} shown={2} total={2}/><RelatedValue filter="keyword" value="כתובה" count={1} label="כל הרשומות עם כתובה">כתובה</RelatedValue></main></MessagesProvider>);
  expect(html).toContain('dir="rtl"');
  if(process.env.PHASE1_FIXTURES==='1') fs.writeFileSync('.guide-tmp/phase1-2010/filters.html',`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><body>${html}</body></html>`);
});
