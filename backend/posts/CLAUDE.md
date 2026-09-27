# CLAUDE.md — posts API

Spring Boot 4.1 / Java 25, base package `com.jp.projects.posts`,
PostgreSQL schema `posts`. Fully implemented. Check the code and
`src/main/resources/db/migration` for current state, not the plan docs.

## Commands (run from `backend/posts`)

```bash
./mvnw clean install
./mvnw spring-boot:run
./mvnw test [-Dtest=ClassName[#method]]   # also writes target/site/jacoco/
```

- **`UnsupportedClassVersionError`** means `JAVA_HOME` is an older JDK.
  Override it for one command only: `JAVA_HOME=/path/to/jdk-25 ./mvnw test`
  (`/usr/libexec/java_home -V` lists installed JDKs).
- **Testcontainers tests** (`PostsApplicationTests`,
  `PostsFlowIntegrationTest`, `PostFlagRepositoryTest`) can fail with
  `Previous attempts to find a Docker environment failed` even when
  `docker info` works. Try `DOCKER_HOST=<socket from docker context ls>`.
  If that doesn't help, verify against the real stack instead:
  `docker compose up -d postgres posts`, then
  `scripts/docker-wait-for-posts.sh`, then `curl` the API or query the DB.

## Code style

Standard Spring Boot idioms, Lombok for boilerplate, MapStruct for DTO
mapping. Match the existing package structure.

## Data model: the docs are the source of truth

Read these before changing the model, and keep them consistent with the
code:
- [`docs/design-spec.md`](docs/design-spec.md): tables, constraints, and
  the decision log. Check the decision log and
  [Open Questions](docs/design-spec.md#6-open-questions-not-yet-answered--do-not-build-against-these)
  first, and record new gaps there in the same format instead of
  deciding them in code.
- [`docs/db-design-spec.md`](docs/db-design-spec.md): the ERD, walked
  through one relationship at a time.
- [`docs/architecture.md`](docs/architecture.md): request lifecycle, REST
  surface, and package layout.
- [`docs/running-locally.md`](docs/running-locally.md): running without
  Docker.

Core entities: `domain` partitions everything else. Then `app_user`,
`resource`, `resource_category` (per domain), `post` (threaded through
`parent_post_id`), `post_type` (per domain), and `post_flag` (a post can
carry several flags, each with its own score). `imdb/standard` flags
always send the same fixed score, so `post_flag.score` stays non-null
(see the frontend's
[decision log](../../frontend/imdb-ui-angular/docs/design-spec.md#2-decision-log),
decision #7).

Auth is a deliberate placeholder: username-only, no password or token
([design-spec](docs/design-spec.md#6-open-questions-not-yet-answered--do-not-build-against-these)).
`APP_CORS_ALLOWED_ORIGINS` and `SPRING_DATASOURCE_URL` override config
through relaxed binding.

## Adding a new domain

Add one new migration, following `V14`/`V16`/`V17`. It inserts the
`domain` row, that domain's own copies of the ten IMDB `titleType`
`resource_category` rows (copied, not shared across domains), and its
`post_type` rows. Import resources with the generic
`imdb-loader --domain <name>`. On the frontend, a domain is one config
file ([architecture](../../frontend/imdb-ui-angular/docs/architecture.md#4-domain-configuration-system)).
