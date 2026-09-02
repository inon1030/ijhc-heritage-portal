-- =============================================================================
-- The vocabulary becomes a thesaurus hung on the logical tree.
--
-- Two problems, both visible in the live data rather than argued from theory.
--
-- ── One: the same thing under two names ─────────────────────────────────────
--
--   Bombay   ← a term
--   Mumbai   ← a term
--
-- One city, two rows, and a search for either misses the other. The unique
-- index catches `Bombay` twice; nothing could tell it that `Bombay` and
-- `Mumbai` are the same place. So a term now has a preferred spelling and any
-- number of variants: `preferred_id` null means this row *is* the term,
-- `preferred_id` set means this row is another way of writing that term.
-- Records only ever store the preferred spelling, so the archive stays
-- consistent while the catalogue stays searchable by whatever a person types.
--
-- This is the prefLabel/altLabel of an ordinary thesaurus, and the reason to
-- use that shape is that it turns "avoid duplicates" — which requires
-- vigilance forever — into "a duplicate is just a variant", which requires one
-- click and is therefore something people will actually do.
--
-- ── Two: a flat bag holding seven different kinds of thing ──────────────────
--
-- The 29 terms mixed subjects (Synagogue), places (Bombay), people (Sir David
-- Ezra), a family that is also a row in `families` (Sassoon), and object types
-- that duplicate `category` (Newspaper). The 36 queued candidates were worse:
-- communities that duplicate the enum, a bare year, and five terms from a
-- holiday photograph of Peru.
--
-- Inon's instruction settles the shape: keywords follow the catalogue he
-- defined, and a new suggestion is a new subdivision *inside* one of those
-- catalogues. So every term now names the branch of the logical tree it hangs
-- under — `domain.lifestyle.food`, `map.geo.cities_villages` — and the model
-- may only propose a term together with the branch it belongs to.
--
-- The branch is text, not a foreign key, because the tree lives in
-- src/lib/fields/registry.ts and is versioned with the code. A term whose
-- branch is deleted from the registry keeps its value and shows as unplaced,
-- exactly as `item_fields` already does.
--
-- `branch_key` is nullable on purpose. Twenty-four of the twenty-nine existing
-- terms are placed below; the remaining five are genuinely ambiguous — is
-- "Architecture" a religious subject or a cultural one? — and guessing on
-- behalf of a cataloguer is how a controlled vocabulary quietly becomes wrong.
-- They surface in the manager as needing a home.
--
-- ── external_id ─────────────────────────────────────────────────────────────
--
-- Added now, empty, because it is the thing that makes cross-referencing
-- possible later and it is far cheaper to add to 29 rows than to 3,000. Two
-- rows carrying the same Wikidata id are the same thing provably, rather than
-- by someone's judgement about spelling.
-- =============================================================================

alter table keywords add column if not exists branch_key   text;
alter table keywords add column if not exists preferred_id uuid references keywords(id) on delete cascade;
alter table keywords add column if not exists external_id  text;

alter table keyword_candidates add column if not exists branch_key text;

create index if not exists keywords_branch_idx on keywords (branch_key)
  where branch_key is not null;

create index if not exists keywords_preferred_idx on keywords (preferred_id)
  where preferred_id is not null;

comment on column keywords.branch_key is
  'Which branch of the logical tree this term subdivides. Matches FieldDef.key in src/lib/fields/registry.ts. Null means not yet placed.';
comment on column keywords.preferred_id is
  'Null: this row is the preferred spelling. Set: this row is a variant of that term, and records store the preferred one.';
comment on column keywords.external_id is
  'An outside authority identifier — wikidata:Q1156, geonames:1275339 — so the archive can be joined to other data later.';

-- ── variants are one level deep, and inherit their term's placement ─────────
--
-- Without this a variant could point at another variant, and "the preferred
-- spelling" would stop being a single hop — every reader would need a loop and
-- one of them would forget. A variant also has no business carrying its own
-- branch or community: it is a spelling of something that already has both.

create or replace function keywords_variant_is_flat()
returns trigger
language plpgsql
as $$
begin
  if new.preferred_id is not null then
    if new.preferred_id = new.id then
      raise exception 'A term cannot be a variant of itself';
    end if;

    if exists (select 1 from keywords k where k.id = new.preferred_id and k.preferred_id is not null) then
      raise exception 'A variant must point at a preferred term, not at another variant';
    end if;

    if exists (select 1 from keywords k where k.preferred_id = new.id) then
      raise exception 'A term that already has variants cannot itself become one';
    end if;

    -- Inherited, never independently set: one term, one placement.
    select k.branch_key, k.community into new.branch_key, new.community
    from keywords k where k.id = new.preferred_id;
  end if;

  return new;
end;
$$;

drop trigger if exists keywords_variant_flat on keywords;
create trigger keywords_variant_flat
  before insert or update of preferred_id on keywords
  for each row execute function keywords_variant_is_flat();

-- ── place the terms that have an unambiguous home ───────────────────────────

update keywords set branch_key = case lower(btrim(term))
  when 'bombay'             then 'map.geo.cities_villages'
  when 'calcutta'           then 'map.geo.cities_villages'
  when 'cochin'             then 'map.geo.cities_villages'
  when 'mumbai'             then 'map.geo.cities_villages'
  when 'community leadership' then 'map.history.key_people'
  when 'lady rachel ezra'   then 'map.history.key_people'
  when 'sir david ezra'     then 'map.history.key_people'
  when 'sassoon'            then 'map.history.key_people'
  when 'baghdadi rite'      then 'domain.lifestyle.traditions'
  when 'hanukkah'           then 'domain.lifestyle.traditions'
  when 'liturgy'            then 'domain.lifestyle.traditions'
  when 'purim'              then 'domain.lifestyle.traditions'
  when 'rosh hashanah'      then 'domain.lifestyle.traditions'
  when 'selichot'           then 'domain.lifestyle.traditions'
  when 'megillat esther'    then 'domain.religious.judaica'
  when 'synagogue'          then 'domain.religious.temples'
  when 'illumination'       then 'domain.religious.art'
  when 'victorian revival'  then 'domain.religious.art'
  when 'dress'              then 'domain.culture.dress'
  when 'devanagari'         then 'domain.culture.literature'
  when 'marathi'            then 'domain.culture.literature'
  when 'newspaper'          then 'media.printed.newspapers'
  when 'printing'           then 'media.printed.books'
  when 'portrait'           then 'media.digital.images'
  when 'studio photography' then 'media.digital.images'
  else branch_key
end
where branch_key is null;

-- Architecture, Family, WIZO, Women and Community leadership's neighbours that
-- are left null are left null deliberately. A cataloguer places them.

-- ── the merge this was built for ────────────────────────────────────────────
-- Bombay becomes a variant of Mumbai. Both keep existing; searching either
-- finds both; new records carry Mumbai.

update keywords
set preferred_id = (select id from keywords where lower(btrim(term)) = 'mumbai' and preferred_id is null)
where lower(btrim(term)) = 'bombay'
  and exists (select 1 from keywords where lower(btrim(term)) = 'mumbai');

-- Records already carrying the old spelling move to the preferred one.
update items
set keywords = array_replace(keywords, 'Bombay', 'Mumbai')
where 'Bombay' = any(keywords);
