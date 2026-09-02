-- =============================================================================
-- A web-viewable derivative, and where a record came from when it came from the
-- web rather than from a file.
--
-- TIFF is what a flatbed scanner writes and what a conservator asks for, and it
-- is the one image format Chrome and Firefox refuse to render. The archive has
-- accepted image/tiff since 0001, so a contributor could upload a scan and see
-- an empty grey square with no way to tell whether the file had arrived.
--
-- The master is never touched. A JPEG rendition sits beside it under
-- `renditions/`, and this column points at it. Null means the master is itself
-- viewable — see src/lib/files/rendition.ts.
-- =============================================================================

alter table item_files
  add column if not exists preview_path text;

comment on column item_files.preview_path is
  'A browser-viewable derivative of a master no browser renders (TIFF). Null when the master is itself viewable. The master is never modified.';

-- `source` is free text a person writes: "The Elias family, Mumbai". This is
-- machine-written, exact and linkable, and only the link ingestion route sets
-- it. Two columns rather than one because a reviewer needs to know which of
-- them a claim rests on.
alter table items
  add column if not exists source_url text;

comment on column items.source_url is
  'The address a record was captured from. Set only by the link ingestion route; never typed by a contributor.';
