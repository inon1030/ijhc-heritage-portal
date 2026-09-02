-- =============================================================================
-- Historical period and place of origin.
--
-- The product outline asks the AI to propose a historical period and a
-- geographic origin alongside community (section 5, "Suggested Classification").
-- Stage 1 carried neither.
--
-- Same rule as everything else: the machine's guess goes in ai_analyses, the
-- reviewer's decision goes in items.
-- =============================================================================

alter table items
  add column period text check (char_length(period) <= 120),
  add column origin_place text check (char_length(origin_place) <= 200);

comment on column items.period is 'Human-verified period, free text: "1890s", "19th century", "before 1948".';
comment on column items.origin_place is 'Human-verified place of origin: "Calcutta, India".';

alter table ai_analyses
  add column suggested_period text,
  add column suggested_origin text,
  add column reasoning text;

comment on column ai_analyses.reasoning is 'What the model says it based its dating and placing on, so a reviewer can judge the guess rather than just accept or reject it.';

-- Keep the search projection in step with the new verified fields.
create or replace function set_items_search_text()
returns trigger
language plpgsql
as $$
begin
  new.search_text :=
    coalesce(new.title, '') || ' ' ||
    coalesce(new.description, '') || ' ' ||
    coalesce(new.provenance, '') || ' ' ||
    coalesce(new.source, '') || ' ' ||
    coalesce(new.period, '') || ' ' ||
    coalesce(new.origin_place, '') || ' ' ||
    coalesce(array_to_string(new.keywords, ' '), '');
  return new;
end;
$$;

drop trigger if exists items_set_search_text on items;

create trigger items_set_search_text
  before insert or update of title, description, provenance, source, keywords, period, origin_place
  on items
  for each row execute function set_items_search_text();

-- Backfill so existing rows pick up the new projection.
update items set title = title;
