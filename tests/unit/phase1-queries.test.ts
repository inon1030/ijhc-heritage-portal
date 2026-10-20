import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, calls: [] as { table: string; method: string; args: unknown[] }[], volunteer: false }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: async () => db, getCurrentVolunteer: async () => state.volunteer ? { id: 'expert' } : null }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabase: () => { throw new Error('No privileged search'); } }));
import { countPublishedItems, getKeywordLabels, getPortalFacetOptions, getCommunityCounts, getPublishedItem, getRelatedValueCounts, listPublishedItems, listRecentlyPublished, listReviewQueue, listUncataloguedPublished, readPages } from '@/lib/items/queries';

type Row = Record<string, unknown>;
function contains(value: unknown, pattern: string) {
  const literal = pattern.slice(1,-1).replace(/\\([%_\\])/g,'$1').toLowerCase();
  return String(value ?? '').toLowerCase().includes(literal);
}
function builder(table: string) {
  let rows = [...(state.tables[table] ?? [])];
  let single = false;
  let from = 0;
  let to = Infinity;
  const sort: { key: string; ascending: boolean }[] = [];
  function log(method: string, args: unknown[]) { state.calls.push({ table, method, args }); }
  const chain = {
    select(...args: unknown[]) { log('select', args); return chain; },
    eq(key: string, value: unknown) { log('eq',[key,value]); rows = rows.filter(r => r[key] === value); return chain; },
    neq(key: string, value: unknown) { rows = rows.filter(r => r[key] !== value); return chain; },
    is(key: string, value: unknown) { log('is',[key,value]); rows = rows.filter(r => r[key] === value); return chain; },
    not(key: string, operator: string, value: unknown) { log('not',[key,operator,value]); rows = rows.filter(r => r[key] !== value); return chain; },
    in(key: string, values: unknown[]) { rows = rows.filter(r => values.includes(r[key])); return chain; },
    overlaps(key: string, values: unknown[]) { rows = rows.filter(r => Array.isArray(r[key]) && (r[key] as unknown[]).some(v => values.includes(v))); return chain; },
    ilike(key: string, value: string) { log('ilike',[key,value]); rows = rows.filter(r => contains(key === 'families.name' ? (r.families as Row)?.name : r[key],value)); return chain; },
    or(expression: string) {
      log('or',[expression]);
      const parts = expression.split(/,(?=[a-z_]+\.ilike\.)/).map(part => { const [key,...rest] = part.split('.ilike.'); return { key, value: JSON.parse(rest.join('.ilike.')) as string }; });
      rows = rows.filter(row => parts.some(p => contains(row[p.key],p.value)));
      return chain;
    },
    order(key: string, options?: { ascending?: boolean }) { log('order',[key,options]); sort.push({ key, ascending: options?.ascending !== false }); return chain; },
    range(a: number,b: number) { from=a;to=b;return chain; },
    limit(n: number) { to=n-1;return chain; },
    maybeSingle() { single=true;return chain; },
    then(resolve: (value: { data: Row[] | Row | null; error: null; count: number }) => unknown) {
      rows.sort((a,b) => { for (const { key, ascending } of sort) { const n=String(a[key]).localeCompare(String(b[key])); if(n)return ascending?n:-n; } return 0; });
      return Promise.resolve(resolve({ data: single ? rows[0] ?? null : rows.slice(from,to+1),error:null,count:rows.length }));
    },
  };
  return chain;
}
const db = { from: builder };
const base = (id: string, extra: Row = {}): Row => ({ id, title: id, description: '', status:'accepted',access:'public',deleted_at:null,category:'documents',community:'cochin',keywords:[],period:null,origin_place:null,language:null,created_at:'2026-01-01',reviewed_at:'2026-02-01',item_files:[],item_fields:[],item_families:[],ai_analyses:[],...extra });
beforeEach(() => {
  state.calls=[];state.volunteer=false;
  state.tables = {
    items:[base('a',{title:'Mumbai wedding',keywords:['Mumbai']}),base('b',{title:'Other'}),base('hidden',{category:null,title:'Mumbai wedding'}),base('private',{access:'restricted',title:'Mumbai wedding'}),base('bin',{deleted_at:'2026-01-02',title:'Mumbai wedding'}),base('pending',{status:'pending',title:'Mumbai wedding'})],
    item_fields:[{id:'field',item_id:'a',value:'כתובה'}],
    item_translations:[{item_id:'a',lang:'he',field:'description',value:'חתונה'},{item_id:'b',lang:'he',field:'transcript',value:'secret'}],
    item_families:[{item_id:'a',family_id:'f',families:{name:'Ezra'}}],
    keywords:[{id:'k',term:'Mumbai',preferred_id:null},{id:'v',term:'Bombay',preferred_id:'k'}],
    keyword_translations:[{keyword_id:'k',lang:'he',label:'מומבאי'}],
  };
});

describe('public search through the session query layer', () => {
  it.each(['mUmBaI','כתובה','חתונה','Ezra','Bombay','מומבאי'])('finds %s across each source', async query => {
    expect((await listPublishedItems({query})).map(r=>r.id)).toEqual(['a']);
    expect(await countPublishedItems({query})).toBe(1);
  });
  it('ANDs words across distinct sources and returns nothing for an unmatched word', async () => {
    expect(await countPublishedItems({query:'Bombay כתובה חתונה Ezra'})).toBe(1);
    expect(await countPublishedItems({query:'Mumbai absent'})).toBe(0);
  });
  it('never searches private readings, even in an expert session', async () => {
    state.volunteer=true;
    expect(await countPublishedItems({query:'secret'})).toBe(0);
    expect(state.calls.some(c=>c.table==='ai_analyses')).toBe(false);
  });
  it('keeps literal wildcard searches literal and quotes the PostgREST grammar', async () => {
    state.tables.items.push(base('literal',{title:'50%_\\,"(test)'}));
    expect((await listPublishedItems({query:'50%_\\,"(test)'})).map(r=>r.id)).toEqual(['literal']);
    const expression = state.calls.find(c=>c.method==='or')!.args[0] as string;
    expect(expression).toContain('title.ilike."');
    expect(expression).toContain('\\\\%');
  });
  it('uses a stable query shape rather than one search per record', async () => {
    await countPublishedItems({query:'Ezra'}); const small=state.calls.filter(c=>c.method==='select').length;
    state.tables.items.push(...Array.from({length:120},(_,i)=>base(`more-${i}`)));
    state.calls=[];
    await countPublishedItems({query:'Ezra'});
    expect(state.calls.filter(c=>c.method==='select').length).toBe(small);
  });
  it('counts all matching records while pagination only limits the list', async () => {
    expect(await countPublishedItems({limit:1})).toBe(2);
    expect(await listPublishedItems({limit:1,offset:1})).toHaveLength(1);
    expect(await listPublishedItems({query:'missing'})).toEqual([]);
  });
  it('applies cataloguing/visibility rules to every public count and recent list', async () => {
    expect(await countPublishedItems()).toBe(2);
    expect((await getCommunityCounts()).cochin).toBe(2);
    expect((await listRecentlyPublished()).map(r=>r.id)).toEqual(['a','b']);
  });
  it('hides uncatalogued detail from visitors but preserves existing expert access', async () => {
    expect(await getPublishedItem('hidden')).toBeNull();
    state.volunteer=true;
    expect((await getPublishedItem('hidden'))?.id).toBe('hidden');
    expect(await getPublishedItem('bin')).toBeNull();
  });
  it('counts only OTHER public catalogued records for links', async () => {
    expect((await getRelatedValueCounts('a')).keyword).toEqual([]);
    expect((await getRelatedValueCounts('a')).community).toEqual([{value:'cochin',label:'cochin',count:1}]);
  });
  it('finds repair records without changing data', async () => {
    expect((await listUncataloguedPublished()).map(r=>r.id)).toEqual(['hidden']);
  });
  it('orders the query oldest first and the resulting queue by reading readiness', async () => {
    state.tables.items=[base('old',{status:'pending',created_at:'2025-01-01'}),base('ready',{status:'pending',created_at:'2026-01-01',ai_analyses:[{status:'succeeded',created_at:'2026-01-02'}]})];
    expect((await listReviewQueue()).map(r=>r.id)).toEqual(['ready','old']);
    expect(state.calls).toContainEqual({table:'items',method:'order',args:['created_at',{ascending:true}]});
  });
  it('continues beyond a database response cap and propagates errors', async () => {
    const load=vi.fn(async (from: number) => ({data:Array.from({length:from===0?500:2},(_,i)=>i+from),error:null}));
    expect(await readPages(load)).toHaveLength(502);
    expect(load).toHaveBeenLastCalledWith(500,999);
    await expect(readPages(async()=>({data:null,error:new Error('failed')}))).rejects.toThrow('failed');
  });
});
it('reads keyword labels only from the requested language and leaves missing labels original', async () => {
  state.tables.keywords[0].keyword_translations=[{lang:'he',label:'מומבאי'}];
  expect(await getKeywordLabels(['Mumbai'],'he')).toEqual({Mumbai:'מומבאי'});
  expect(await getKeywordLabels(['Mumbai'],'en')).toEqual({});
  expect(await getKeywordLabels([],'he')).toEqual({});
});
it('scopes option counts to the public search result and an optional contributor set', async () => {
  expect((await getPortalFacetOptions({query:'Ezra'})).community[0].count).toBe(1);
  expect((await getPortalFacetOptions({},[])).community).toEqual([]);
});
