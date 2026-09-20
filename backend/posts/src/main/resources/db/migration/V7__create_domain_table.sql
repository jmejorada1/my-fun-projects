CREATE SEQUENCE domain_id_seq START WITH 1 INCREMENT BY 50;
CREATE TABLE domain (
    id            BIGINT PRIMARY KEY DEFAULT nextval('domain_id_seq'),
    name          VARCHAR(64) NOT NULL,
    display_name  VARCHAR(128) NOT NULL,
    data          JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_domain_name UNIQUE (name)
);
ALTER SEQUENCE domain_id_seq OWNED BY domain.id;

INSERT INTO domain (name, display_name) VALUES ('imdb', 'IMDB');
