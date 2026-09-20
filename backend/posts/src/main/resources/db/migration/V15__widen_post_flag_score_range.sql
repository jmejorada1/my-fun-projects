-- Widens post_flag.score to include 0 ("neutral"), per request — previously
-- 1-5 only (5 = most severe). 0 is not a lack of a flag; it's an explicit
-- "looked at this, found it neutral" data point, distinct from having no
-- post_flag row at all for that post_type.
ALTER TABLE post_flag DROP CONSTRAINT chk_post_flag_score;
ALTER TABLE post_flag ADD CONSTRAINT chk_post_flag_score CHECK (score BETWEEN 0 AND 5);
