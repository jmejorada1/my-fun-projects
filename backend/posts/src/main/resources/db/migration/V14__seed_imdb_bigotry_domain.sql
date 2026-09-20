-- Seeds the imdb/bigotry domain (frontend/imdb-ui-angular/docs/design-spec.md
-- §3.1). The domain row was already created by hand in some environments
-- during frontend design work, so this insert is idempotent (ON CONFLICT DO
-- NOTHING) — it both backfills that manual state consistently and applies
-- cleanly on fresh environments (Testcontainers, other machines) where the
-- row doesn't exist yet. display_name matches what was already set by hand.
INSERT INTO domain (name, display_name) VALUES ('imdb/bigotry', 'IMDB-BIG')
    ON CONFLICT (name) DO NOTHING;

INSERT INTO resource_category (name, display_name, domain_id) VALUES
    ('movie', 'Movie', (SELECT id FROM domain WHERE name = 'imdb/bigotry')),
    ('short', 'Short Film', (SELECT id FROM domain WHERE name = 'imdb/bigotry')),
    ('tvSeries', 'TV Series', (SELECT id FROM domain WHERE name = 'imdb/bigotry')),
    ('tvEpisode', 'TV Episode', (SELECT id FROM domain WHERE name = 'imdb/bigotry')),
    ('tvMiniSeries', 'TV Mini-Series', (SELECT id FROM domain WHERE name = 'imdb/bigotry')),
    ('tvMovie', 'TV Movie', (SELECT id FROM domain WHERE name = 'imdb/bigotry')),
    ('tvSpecial', 'TV Special', (SELECT id FROM domain WHERE name = 'imdb/bigotry')),
    ('tvShort', 'TV Short', (SELECT id FROM domain WHERE name = 'imdb/bigotry')),
    ('video', 'Video', (SELECT id FROM domain WHERE name = 'imdb/bigotry')),
    ('videoGame', 'Video Game', (SELECT id FROM domain WHERE name = 'imdb/bigotry'));

INSERT INTO post_type (name, domain_id) VALUES
    ('racism', (SELECT id FROM domain WHERE name = 'imdb/bigotry')),
    ('sexism', (SELECT id FROM domain WHERE name = 'imdb/bigotry')),
    ('lgbtq-phobic', (SELECT id FROM domain WHERE name = 'imdb/bigotry'));
