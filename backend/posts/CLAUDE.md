# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Fully implemented, not a scaffold — entities, repositories, services,
controllers, DTOs/mappers, and Flyway migrations through `V17` all exist
under `src/main/java` and `src/main/resources/db/migration`. Two domains
are seeded: `imdb/bigotry` (severity-scored flags) and `imdb/standard` (a
plain rating, no severity — `V17__seed_imdb_standard_domain.sql`). The
docs in `docs/` (below) were the original implementation plan and remain
the canonical data-model reference, but check the actual code/migrations
for current state rather than assuming the docs are still describing
something not yet built.

## Commands

Build/run/test are driven through the Maven wrapper (`./mvnw`), run from
`posts/`.

- Build: `./mvnw clean install`
- Run the app: `./mvnw spring-boot:run`
- Run all tests: `./mvnw test`
- Run a single test class: `./mvnw test -Dtest=ClassName`
- Run a single test method: `./mvnw test -Dtest=ClassName#methodName`

**Local `JAVA_HOME` may not match this project's Java 25.** If `./mvnw`
fails with `UnsupportedClassVersionError`, override for the one command
rather than changing `JAVA_HOME` globally:
`JAVA_HOME=/path/to/jdk-25 ./mvnw test` (`/usr/libexec/java_home -V` on
macOS lists installed JDKs).

**Testcontainers-backed tests (`PostsApplicationTests`,
`PostsFlowIntegrationTest`, `PostFlagRepositoryTest`) may fail with
`Previous attempts to find a Docker environment failed` even when the
`docker` CLI itself works fine** (`docker info` succeeds). Worth trying
`DOCKER_HOST=<active context's socket>` (`docker context ls`), but not
guaranteed to fix it. If it doesn't, verify against the real
`docker compose` stack instead — build and start `postgres`+`posts`,
wait for Flyway via `../../scripts/docker-wait-for-posts.sh`, then query
the DB directly or hit the API with `curl`. That path doesn't depend on
Testcontainers' Docker auto-detection.

## Architecture

### Domain model

The service lets users post about IMDB titles (movie/TV/short/video game/
etc.) and reply underneath other posts. Posts can carry flags — what a
flag *means* is domain-specific: `imdb/bigotry` flags a post with a
content-type category (`racism`/`sexism`/`lgbtq-phobic`/`no-bigotry`) plus
a 0–5 severity score; `imdb/standard` flags a post with a plain rating
category (`skip-it`/`it-was-okay`/`i-enjoyed-it`/`i-loved-it`) and a fixed,
meaningless score (the frontend always sends the same constant — see
`frontend/imdb-ui-angular/docs/domain-configurability-plan.md` §9 for why
that's the deliberate, no-schema-change approach rather than making
`post_flag.score` nullable). Core entities: `domain` (partitions
everything else), `app_user`, `resource`, `resource_category` (lookup,
seeded per domain from IMDB's `titleType` values), `post`
(self-referencing via `parent_post_id` for unlimited-depth threaded
replies), `post_type` (lookup, seeded per domain), `post_flag` (join
table — a single post can carry multiple type flags, each with its own
score). Full ERD and relationship-by-relationship rationale:
`docs/db-design-spec.md`.

### Adding a new domain

Follow the pattern in `V14__seed_imdb_bigotry_domain.sql` /
`V16__seed_no_bigotry_post_type.sql` /
`V17__seed_imdb_standard_domain.sql`: one migration inserting the
`domain` row, its `resource_category` rows (the same ten IMDB
`titleType` values, since `resource_category` is domain-scoped —
copy, don't share, across domains), and its `post_type` rows. Import
resources for it via the already-generic `imdb-loader`
(`docker compose run --rm imdb-loader --domain <name>`) — no code change
needed there. The frontend side of "add a domain" is a single config file;
see `frontend/imdb-ui-angular/docs/domain-configurability-plan.md`.

### Docs are the source of truth for the data model — read before changing it

`docs/` contains a chain of living specs that must stay consistent with
each other and with the code:

- `docs/design-spec.md` — the canonical data model: table definitions,
  constraints, and a running decision log. Every non-obvious modeling
  choice (soft-delete strategy, threading depth, category taxonomy,
  cascade behavior, domain scoping) is recorded here with its rationale.
- `docs/db-design-spec.md` — plain-language, relationship-by-relationship
  narrative walkthrough of the ER diagram, for faster onboarding.
- `docs/architecture.md` — components, request lifecycle, REST API
  surface, package layout, and how the domain-scoping design is meant to
  support more than the current IMDB domains.
- `docs/running-locally.md` — running this service without Docker.

Before changing the data model, check `design-spec.md`'s decision log /
"Open Questions" section. If you find a gap it doesn't already cover, add
it using the same decision-log / open-questions format rather than
deciding silently in code.

### Tech stack specifics

Spring Boot 4.1.1, Java 25, base package `com.jp.projects.posts`,
PostgreSQL (schema `posts`). `spring-boot-starter-security` is a
dependency, but auth is intentionally a placeholder (`design-spec.md` §6)
— username-only login/register, no password/token yet.
`app.cors.allowed-origins` and `spring.datasource.url` are both
overridable via env var (`APP_CORS_ALLOWED_ORIGINS`,
`SPRING_DATASOURCE_URL`) through Spring's relaxed binding, no code change
needed — see `docker-compose.yml`'s `posts` service and the root
`CLAUDE.md`/README for how the whole stack's ports are centralized in
`.env`.

## Working with this repo

Do not guess when requirements, data model details, or design intent are
unclear or underspecified. Ask a question, or add it as an explicit open
item in the relevant spec doc under `docs/`, rather than silently picking a
default. When you notice something worth flagging — a design inconsistency,
a better approach, a gap between the docs and the code — say so rather than
staying quiet about it.
