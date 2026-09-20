ALTER TABLE post_flag ADD COLUMN domain_id BIGINT;

UPDATE post_flag pf SET domain_id = p.domain_id
    FROM post p
    WHERE p.id = pf.post_id;

ALTER TABLE post_flag ALTER COLUMN domain_id SET NOT NULL;

-- Derived, DB-enforced: a flag's domain must match its post's domain, and
-- the flag's type must belong to that same domain (domain-scoping-spec.md
-- D12/§3).
ALTER TABLE post_flag
    ADD CONSTRAINT fk_post_flag_post_same_domain
    FOREIGN KEY (post_id, domain_id) REFERENCES post (id, domain_id);

ALTER TABLE post_flag
    ADD CONSTRAINT fk_post_flag_type_same_domain
    FOREIGN KEY (post_type_id, domain_id) REFERENCES post_type (id, domain_id);

CREATE INDEX idx_post_flag_domain_id ON post_flag (domain_id);
