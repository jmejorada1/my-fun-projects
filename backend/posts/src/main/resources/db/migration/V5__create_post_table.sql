CREATE SEQUENCE post_id_seq START WITH 1 INCREMENT BY 50;
CREATE TABLE post (
    id               BIGINT PRIMARY KEY DEFAULT nextval('post_id_seq'),
    resource_id      BIGINT NOT NULL REFERENCES resource (id),
    user_id          BIGINT NOT NULL REFERENCES app_user (id),
    parent_post_id   BIGINT,
    body_text        TEXT NOT NULL,
    data             JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ,
    CONSTRAINT uq_post_id_resource UNIQUE (id, resource_id)
);
ALTER SEQUENCE post_id_seq OWNED BY post.id;

ALTER TABLE post
    ADD CONSTRAINT fk_post_parent_same_resource
    FOREIGN KEY (parent_post_id, resource_id) REFERENCES post (id, resource_id);

CREATE INDEX idx_post_resource_id ON post (resource_id);
CREATE INDEX idx_post_user_id ON post (user_id);
CREATE INDEX idx_post_parent_post_id ON post (parent_post_id);
