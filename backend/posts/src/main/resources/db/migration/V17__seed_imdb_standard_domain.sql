-- Seeds the imdb/standard domain (frontend/imdb-ui-angular/docs/domain-
-- configurability-plan.md §11, Phase 2b) — a plain "skip it / it was okay /
-- I enjoyed it / I loved it" rating domain, no severity score to average
-- (plan §9: the frontend always submits a fixed score for this domain's
-- flags; ranking by count falls out of /rankings' existing AVG/COUNT query
-- for free once every flag's score is equal). Idempotent (ON CONFLICT DO
-- NOTHING), same pattern as V14__seed_imdb_bigotry_domain.sql.
INSERT INTO domain (name, display_name) VALUES ('imdb/standard', 'Movie-Meter')
    ON CONFLICT (name) DO NOTHING;

-- resource_category is scoped per domain (design-spec.md §4.3) — imdb/standard
-- needs its own copies of the same IMDB titleType values, not shared rows.
INSERT INTO resource_category (name, display_name, domain_id) VALUES
    ('movie', 'Movie', (SELECT id FROM domain WHERE name = 'imdb/standard')),
    ('short', 'Short Film', (SELECT id FROM domain WHERE name = 'imdb/standard')),
    ('tvSeries', 'TV Series', (SELECT id FROM domain WHERE name = 'imdb/standard')),
    ('tvEpisode', 'TV Episode', (SELECT id FROM domain WHERE name = 'imdb/standard')),
    ('tvMiniSeries', 'TV Mini-Series', (SELECT id FROM domain WHERE name = 'imdb/standard')),
    ('tvMovie', 'TV Movie', (SELECT id FROM domain WHERE name = 'imdb/standard')),
    ('tvSpecial', 'TV Special', (SELECT id FROM domain WHERE name = 'imdb/standard')),
    ('tvShort', 'TV Short', (SELECT id FROM domain WHERE name = 'imdb/standard')),
    ('video', 'Video', (SELECT id FROM domain WHERE name = 'imdb/standard')),
    ('videoGame', 'Video Game', (SELECT id FROM domain WHERE name = 'imdb/standard'))
    ON CONFLICT (domain_id, name) DO NOTHING;

-- The four rating categories — matches imdb-standard.config.ts's
-- CATEGORY_BADGE_CLASS keys exactly (skip-it -> ... -> i-loved-it,
-- worst -> best).
INSERT INTO post_type (name, domain_id) VALUES
    ('skip-it', (SELECT id FROM domain WHERE name = 'imdb/standard')),
    ('it-was-okay', (SELECT id FROM domain WHERE name = 'imdb/standard')),
    ('i-enjoyed-it', (SELECT id FROM domain WHERE name = 'imdb/standard')),
    ('i-loved-it', (SELECT id FROM domain WHERE name = 'imdb/standard'))
    ON CONFLICT (domain_id, name) DO NOTHING;
