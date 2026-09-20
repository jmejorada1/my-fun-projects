CREATE SEQUENCE resource_category_id_seq START WITH 1 INCREMENT BY 50;
CREATE TABLE resource_category (
    id            BIGINT PRIMARY KEY DEFAULT nextval('resource_category_id_seq'),
    name          VARCHAR(64) NOT NULL,
    display_name  VARCHAR(128) NOT NULL,
    data          JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_resource_category_name UNIQUE (name)
);
ALTER SEQUENCE resource_category_id_seq OWNED BY resource_category.id;

CREATE SEQUENCE post_type_id_seq START WITH 1 INCREMENT BY 50;
CREATE TABLE post_type (
    id          BIGINT PRIMARY KEY DEFAULT nextval('post_type_id_seq'),
    name        VARCHAR(64) NOT NULL,
    data        JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_post_type_name UNIQUE (name)
);
ALTER SEQUENCE post_type_id_seq OWNED BY post_type.id;
