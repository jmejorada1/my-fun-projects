CREATE SEQUENCE post_flag_id_seq START WITH 1 INCREMENT BY 50;
CREATE TABLE post_flag (
    id             BIGINT PRIMARY KEY DEFAULT nextval('post_flag_id_seq'),
    post_id        BIGINT NOT NULL REFERENCES post (id),
    post_type_id   BIGINT NOT NULL REFERENCES post_type (id),
    score          SMALLINT NOT NULL,
    data           JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMPTZ,
    CONSTRAINT chk_post_flag_score CHECK (score BETWEEN 1 AND 5)
);
ALTER SEQUENCE post_flag_id_seq OWNED BY post_flag.id;

CREATE UNIQUE INDEX uq_post_flag_active_post_type
    ON post_flag (post_id, post_type_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_post_flag_post_id ON post_flag (post_id);
