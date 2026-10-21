-- Required for free terms of 1 to 80 characters. No role or policy changes.
-- Not applied by this task.
begin;
alter table public.keywords drop constraint keywords_term_check;
alter table public.keywords add constraint keywords_term_check check (length(btrim(term)) between 1 and 80);
alter table public.keyword_candidates drop constraint keyword_candidates_term_check;
alter table public.keyword_candidates add constraint keyword_candidates_term_check check (length(btrim(term)) between 1 and 80);
commit;
