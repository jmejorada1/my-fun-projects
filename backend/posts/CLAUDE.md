# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This is a fresh Spring Boot scaffold — `src/main/java` currently contains
only `PostsApplication.java`. There are no entities, repositories, services,
or controllers yet. The full implementation plan already lives in `docs/`
(see below) and should be followed when writing code, not re-derived from
scratch.

## Commands

Build/run/test are driven through the Maven wrapper (`./mvnw`), run from
`posts/`.

- Build: `./mvnw clean install`
- Run the app: `./mvnw spring-boot:run`
- Run all tests: `./mvnw test`
- Run a single test class: `./mvnw test -Dtest=ClassName`
- Run a single test method: `./mvnw test -Dtest=ClassName#methodName`

## Architecture

### Domain model

The service lets users post about IMDB titles (movie/TV/short/video game/
etc.) and reply underneath other posts, with each post optionally flagged
for content type (`racism`/`sexism`/`lgbtq-phobic`) plus a 1–5 severity
score. Core entities: `app_user`, `resource`, `resource_category` (lookup,
seeded from IMDB's `titleType` values), `post` (self-referencing via
`parent_post_id` for unlimited-depth threaded replies), `post_type`
(lookup), `post_flag` (join table — a single post can carry multiple type
flags, each with its own score). Full ERD and relationship-by-relationship
rationale: `docs/db-design-spec.md`.

### Docs are the source of truth — read before implementing

`docs/` contains a chain of specs that must stay consistent with each other
and with the code:

- `docs/requirements.txt` — original raw product requirements (rough draft,
  superseded by the specs below wherever they differ).
- `docs/design-spec.md` — the canonical data model: table definitions,
  constraints, and a running "Assumptions & Decisions" / "Resolved
  Questions" / "Open Questions" log. Every non-obvious modeling choice
  (soft-delete strategy, threading depth, category taxonomy, cascade
  behavior) is recorded here with its rationale.
- `docs/db-design-spec.md` — plain-language, relationship-by-relationship
  narrative walkthrough of the ER diagram, for faster onboarding.
- `docs/implementation-spec-spring-boot.md` — the concrete Spring Boot
  build plan: dependencies to add (Flyway, Lombok, MapStruct,
  springdoc-openapi, Testcontainers — none are in `pom.xml` yet), package
  layout, Flyway migration SQL, entity/repository/service conventions
  (including transaction boundaries), the REST endpoint surface, and error
  handling. This is what to follow when actually writing code.

Before implementing anything, check these docs' decision-log / "Open
Questions" sections. If you find a gap they don't already cover, add it to
the relevant doc using the same decision-log / open-questions format rather
than deciding silently in code.

### Tech stack specifics

Spring Boot 4.1.1, Java 25, base package `com.jp.projects.posts`,
PostgreSQL. `spring-boot-starter-security` is already a dependency, but auth
is intentionally deferred (see `design-spec.md`) — the implementation spec
calls for a permit-all `SecurityFilterChain` stub with a TODO, not a real
auth flow, until an auth mechanism is actually chosen.

## Working with this repo

Do not guess when requirements, data model details, or design intent are
unclear or underspecified. Ask a question, or add it as an explicit open
item in the relevant spec doc under `docs/`, rather than silently picking a
default. When you notice something worth flagging — a design inconsistency,
a better approach, a gap between the docs and the code — say so rather than
staying quiet about it.
