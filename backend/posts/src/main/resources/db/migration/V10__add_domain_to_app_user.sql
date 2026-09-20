ALTER TABLE app_user ADD COLUMN domain_id BIGINT;

UPDATE app_user SET domain_id = (SELECT id FROM domain WHERE name = 'imdb');

ALTER TABLE app_user ALTER COLUMN domain_id SET NOT NULL;
ALTER TABLE app_user
    ADD CONSTRAINT fk_app_user_domain FOREIGN KEY (domain_id) REFERENCES domain (id);

ALTER TABLE app_user DROP CONSTRAINT uq_app_user_username;
ALTER TABLE app_user DROP CONSTRAINT uq_app_user_email;
ALTER TABLE app_user ADD CONSTRAINT uq_app_user_domain_username UNIQUE (domain_id, username);
ALTER TABLE app_user ADD CONSTRAINT uq_app_user_domain_email UNIQUE (domain_id, email);
ALTER TABLE app_user ADD CONSTRAINT uq_app_user_id_domain UNIQUE (id, domain_id);

CREATE INDEX idx_app_user_domain_id ON app_user (domain_id);
