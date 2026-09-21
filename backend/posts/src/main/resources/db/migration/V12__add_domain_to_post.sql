ALTER TABLE post ADD COLUMN domain_id BIGINT;

UPDATE post p SET domain_id = r.domain_id
    FROM resource r
    WHERE r.id = p.resource_id;

ALTER TABLE post ALTER COLUMN domain_id SET NOT NULL;

-- Derived, DB-enforced: a post's domain must match its resource's domain,
-- and its author must belong to that same domain (design-spec.md §4.3).
ALTER TABLE post
    ADD CONSTRAINT fk_post_resource_same_domain
    FOREIGN KEY (resource_id, domain_id) REFERENCES resource (id, domain_id);

ALTER TABLE post
    ADD CONSTRAINT fk_post_user_same_domain
    FOREIGN KEY (user_id, domain_id) REFERENCES app_user (id, domain_id);

ALTER TABLE post ADD CONSTRAINT uq_post_id_domain UNIQUE (id, domain_id);

CREATE INDEX idx_post_domain_id ON post (domain_id);
