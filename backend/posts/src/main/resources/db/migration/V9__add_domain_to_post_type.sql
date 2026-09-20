ALTER TABLE post_type ADD COLUMN domain_id BIGINT;

UPDATE post_type SET domain_id = (SELECT id FROM domain WHERE name = 'imdb');

ALTER TABLE post_type ALTER COLUMN domain_id SET NOT NULL;
ALTER TABLE post_type
    ADD CONSTRAINT fk_post_type_domain FOREIGN KEY (domain_id) REFERENCES domain (id);

ALTER TABLE post_type DROP CONSTRAINT uq_post_type_name;
ALTER TABLE post_type ADD CONSTRAINT uq_post_type_domain_name UNIQUE (domain_id, name);
ALTER TABLE post_type ADD CONSTRAINT uq_post_type_id_domain UNIQUE (id, domain_id);

CREATE INDEX idx_post_type_domain_id ON post_type (domain_id);
