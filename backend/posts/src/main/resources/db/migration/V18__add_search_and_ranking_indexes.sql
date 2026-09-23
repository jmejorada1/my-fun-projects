-- Indexes for the two queries that scan the most rows.
--
-- 1. GET /resources?search=… (ResourceRepository.search) matches
--    lower(display_name) LIKE '%…%'. A leading wildcard makes a B-tree
--    index unusable, so this was a sequential scan over `resource` — a
--    table loaded from IMDB's full title dump — on every search request
--    from the UI. A pg_trgm GIN index supports leading-wildcard LIKE,
--    and must be on exactly the expression the query uses,
--    lower(display_name), for the planner to match it.
--
-- 2. GET /rankings (PostFlagRepository.findTopRankedResourcesByPostType)
--    aggregates post_flag filtered on domain_id + deleted_at IS NULL and
--    grouped by (post_type_id, post_id). post_flag previously had only
--    idx_post_flag_post_id and idx_post_flag_domain_id.

-- pg_trgm needs to be installed where the index can resolve gin_trgm_ops.
-- No WITH SCHEMA: Flyway runs with search_path set to this migration's
-- default schema (posts), so the extension lands there alongside the
-- index and the runtime query, which use the same search_path.
-- Requires a role allowed to CREATE EXTENSION; the Docker Compose stack's
-- postgres superuser is, a managed instance may need it pre-installed.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_resource_display_name_trgm
    ON resource USING gin (lower(display_name) gin_trgm_ops);

CREATE INDEX idx_post_flag_rankings
    ON post_flag (domain_id, post_type_id, post_id)
    WHERE deleted_at IS NULL;
