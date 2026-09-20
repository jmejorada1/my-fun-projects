CREATE SEQUENCE resource_id_seq START WITH 1 INCREMENT BY 50;
CREATE TABLE resource (
    id            BIGINT PRIMARY KEY DEFAULT nextval('resource_id_seq'),
    name          VARCHAR(32) NOT NULL,
    display_name  VARCHAR(512) NOT NULL,
    category_id   BIGINT NOT NULL REFERENCES resource_category (id),
    data          JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,
    CONSTRAINT uq_resource_name UNIQUE (name)
);
ALTER SEQUENCE resource_id_seq OWNED BY resource.id;
CREATE INDEX idx_resource_category_id ON resource (category_id);
