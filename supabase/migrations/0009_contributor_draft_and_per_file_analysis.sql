-- =============================================================================
-- What the contributor wrote, kept apart from what a reviewer approved.
--
-- The client asked that an unregistered contributor be able to correct the
-- machine's description and tags before submitting. Writing those straight into
-- `items.description` would break the one rule the archive is built on — that
-- nothing reaches the record until a person with responsibility for the archive
-- has moved it there.
--
-- So the contributor's version lands in its own pair of columns. The reviewer
-- sees it in the workbench beside the machine's suggestion and decides which,
-- if either, becomes the record. A contributor who simply accepts the AI text
-- has not thereby published AI text.
-- =============================================================================

alter table items add column if not exists contributor_description text;
alter table items add column if not exists contributor_keywords text[] not null default '{}';

-- One analysis per file, now that a record can hold several.
--
-- A five-page prayer book is one record with five files, and the OCR of page
-- four belongs to page four. Null means the row predates this column, when an
-- item had exactly one file and the distinction could not arise.
alter table ai_analyses add column if not exists file_id uuid references item_files(id) on delete cascade;

create index if not exists ai_analyses_file_idx on ai_analyses (file_id);
