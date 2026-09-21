ALTER TABLE resource ADD COLUMN domain_id BIGINT;

UPDATE resource r SET domain_id = rc.domain_id
    FROM resource_category rc
    WHERE rc.id = r.category_id;

ALTER TABLE resource ALTER COLUMN domain_id SET NOT NULL;

-- Derived, DB-enforced: a resource's domain must match its category's
-- domain (design-spec.md §4.3).
ALTER TABLE resource
    ADD CONSTRAINT fk_resource_category_same_domain
    FOREIGN KEY (category_id, domain_id) REFERENCES resource_category (id, domain_id);

ALTER TABLE resource DROP CONSTRAINT uq_resource_name;
ALTER TABLE resource ADD CONSTRAINT uq_resource_domain_name UNIQUE (domain_id, name);
ALTER TABLE resource ADD CONSTRAINT uq_resource_id_domain UNIQUE (id, domain_id);

CREATE INDEX idx_resource_domain_id ON resource (domain_id);
