-- =============================================================================
-- The community suggestion gets a column, like every other suggestion.
--
-- It was the odd one out: `suggested_period` and `suggested_origin` had columns,
-- but the review screen read the community out of `ai_analyses.raw` — the
-- provider's untouched response. That coupled a screen to a vendor's JSON shape,
-- which is exactly what the AIProvider interface exists to prevent. Swapping to
-- another vendor would have made the suggestion disappear from the review screen
-- with no error at all.
-- =============================================================================

alter table ai_analyses add column suggested_community community;

comment on column ai_analyses.suggested_community is 'Suggested community. Like every other suggestion, it lives in a column, not inside the vendor-specific raw blob.';

-- Backfill rows written before the column existed.
update ai_analyses
set suggested_community = (raw ->> 'suggestedCommunity')::community
where raw ->> 'suggestedCommunity' in ('bene_israel', 'cochin', 'baghdadi', 'bnei_menashe');
