ALTER TABLE resource_category ADD COLUMN domain_id BIGINT;

UPDATE resource_category SET domain_id = (SELECT id FROM domain WHERE name = 'imdb');

ALTER TABLE resource_category ALTER COLUMN domain_id SET NOT NULL;
ALTER TABLE resource_category
    ADD CONSTRAINT fk_resource_category_domain FOREIGN KEY (domain_id) REFERENCES domain (id);

ALTER TABLE resource_category DROP CONSTRAINT uq_resource_category_name;
ALTER TABLE resource_category ADD CONSTRAINT uq_resource_category_domain_name UNIQUE (domain_id, name);
ALTER TABLE resource_category ADD CONSTRAINT uq_resource_category_id_domain UNIQUE (id, domain_id);

CREATE INDEX idx_resource_category_domain_id ON resource_category (domain_id);
