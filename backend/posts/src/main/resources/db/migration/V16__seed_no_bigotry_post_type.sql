-- Adds a "No Bigotry" category to the imdb/bigotry domain — the frontend
-- treats it as a neutral/no-flag-detected flag and auto-fills severity 0,
-- but it's still stored as a real post_type + post_flag pairing (schema
-- doesn't distinguish it from racism/sexism/lgbtq-phobic).
INSERT INTO post_type (name, domain_id) VALUES
    ('no-bigotry', (SELECT id FROM domain WHERE name = 'imdb/bigotry'))
    ON CONFLICT (domain_id, name) DO NOTHING;
