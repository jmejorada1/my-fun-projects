CREATE SEQUENCE app_user_id_seq START WITH 1 INCREMENT BY 50;
CREATE TABLE app_user (
    id          BIGINT PRIMARY KEY DEFAULT nextval('app_user_id_seq'),
    username    VARCHAR(64) NOT NULL,
    email       VARCHAR(255) NOT NULL,
    first_name  VARCHAR(128),
    last_name   VARCHAR(128),
    data        JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_app_user_username UNIQUE (username),
    CONSTRAINT uq_app_user_email UNIQUE (email)
);
ALTER SEQUENCE app_user_id_seq OWNED BY app_user.id;
