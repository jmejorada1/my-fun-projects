# Running Posts Locally (Without Docker)

How to build, run, and test the `posts` Spring Boot service directly on
your machine — no `docker compose` involved. For the fully-dockerized
workflow (all three components, mock data seeding), see the
[root README.md](../../../README.md) and
[root CLAUDE.md](../../../CLAUDE.md) instead. For what the service does
and how it's put together, see [`architecture.md`](./architecture.md).

## Table of Contents

- [1. Prerequisites](#1-prerequisites)
- [2. Install and Start PostgreSQL](#2-install-and-start-postgresql)
- [3. Connection Configuration](#3-connection-configuration)
- [4. Running the App](#4-running-the-app)
- [5. Verifying It's Up](#5-verifying-its-up)
- [6. Running Tests](#6-running-tests)
- [7. Creating Data Manually](#7-creating-data-manually)
- [8. Troubleshooting](#8-troubleshooting)

## 1. Prerequisites

- **Java 25**, with `JAVA_HOME` pointed at it. A plain shell's `java
  -version` may already resolve to 25, but `JAVA_HOME` (which `./mvnw`
  uses) can still be pinned to an older JDK installed separately — check
  with `mvn -v` if a build fails with `release version 25 not supported`
  or `UnsupportedClassVersionError`. On macOS, list installed JDKs with
  `/usr/libexec/java_home -V` and override for one command rather than
  changing `JAVA_HOME` globally:
  ```bash
  JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-25.jdk/Contents/Home ./mvnw spring-boot:run
  ```
- **PostgreSQL**, running locally and reachable at `localhost:5432`. No
  Docker required — a native install (Homebrew, `postgres.app`, etc.)
  works fine, and Flyway creates the schema/tables for you (§4).
- **Docker** — only needed if you want to run the Testcontainers-backed
  repository/integration tests (§6). Not needed to build, run, or unit
  test the app.
- The **Maven wrapper** (`./mvnw`), already checked into `backend/posts/`
  — no separate Maven install needed. All commands below are run from
  `backend/posts/`.

## 2. Install and Start PostgreSQL

If Postgres isn't already running:

```bash
# Homebrew, macOS:
brew services start postgresql@18   # or whichever version you have installed

# One-time: create the database (the posts *schema* inside it is created
# automatically by Flyway on first run — see §4, no manual DDL needed)
createdb posts-db
```

Any Postgres reachable at `localhost:5432` with a `postgres` role able to
connect works — the version isn't pinned by this service, just by
whatever features Flyway's DDL relies on (jsonb, partial unique indexes —
supported since Postgres 9.5+).

**If you also run the Docker Compose stack on this machine:** its
`postgres` service publishes on host port `5433` by default (see
`.env.example`'s `POSTGRES_PORT`), specifically so it doesn't collide with
a natively-installed Postgres on the standard `5432`. The two can coexist;
just don't point this native setup at `5433` — the schema/migration state
in the Docker volume is a separate database from your local one.

## 3. Connection Configuration

Defaults live in `src/main/resources/application.yml`:

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/posts-db
    username: postgres
    password: "P@55w0rd"
    hikari:
      schema: posts
  flyway:
    schemas: posts
    default-schema: posts
    create-schemas: true

app:
  cors:
    allowed-origins: http://localhost:4200
```

If your local Postgres uses different credentials, edit these lines
directly, or override via environment variables instead (Spring's relaxed
binding — no code change needed either way):

```bash
export SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/posts-db
export SPRING_DATASOURCE_USERNAME=postgres
export SPRING_DATASOURCE_PASSWORD=your-password
export APP_CORS_ALLOWED_ORIGINS=http://localhost:4200
```

A few things worth knowing about this config:

- `spring.datasource.hikari.schema` (not a `?currentSchema=posts` query
  param on the URL) is what makes unqualified table references — the
  native `@Modifying` queries in `PostRepository`/`PostFlagRepository`,
  and Hibernate's own DDL/DML — resolve against the `posts` schema rather
  than `public`. A URL param would work for the running app but gets
  silently dropped by Testcontainers' `@ServiceConnection` in tests, which
  builds its own JDBC URL; the Hikari property applies uniformly in both
  cases.
- `app.cors.allowed-origins` needs to include whatever origin your
  frontend runs on locally — `http://localhost:4200` is `ng serve`'s
  default for `imdb-ui-angular`. A future non-Docker `todo-ui` React dev
  server would add its own origin here (comma-separated) the same way.

## 4. Running the App

```bash
cd backend/posts
export JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-25.jdk/Contents/Home  # adjust to your install
./mvnw spring-boot:run
```

On success you'll see Flyway apply all 17 migrations (`V1`–`V17`) followed
by `Started PostsApplication in N seconds`. The app listens on
`http://localhost:8080`. A `Using generated security password: ...` line
in the log is expected and harmless — it's Spring Security's default
autoconfiguration output, unused since `SecurityConfig` permits every
request while real auth remains unbuilt (`design-spec.md` §6).

## 5. Verifying It's Up

```bash
curl http://localhost:8080/domains
```

Should return the seeded domains (`imdb/bigotry`, `imdb/standard` as of
`V17`):

```json
[{"id":1,"name":"imdb/bigotry","displayName":"..."},{"id":2,"name":"imdb/standard","displayName":"..."}]
```

Or browse the API directly:

- **Swagger UI:** http://localhost:8080/swagger-ui.html
- **OpenAPI JSON:** http://localhost:8080/v3/api-docs

## 6. Running Tests

```bash
./mvnw test                                     # full suite
./mvnw test -Dtest=PostServiceTest              # a single unit test — no Docker needed
./mvnw test -Dtest=ResourceControllerTest       # a single @WebMvcTest — no Docker needed
./mvnw test -Dtest=PostFlagRepositoryTest       # @DataJpaTest + Testcontainers — needs Docker
./mvnw test -Dtest=PostsFlowIntegrationTest     # full happy-path flow — needs Docker
./mvnw clean install                            # build + full test suite (needs Docker)
```

Unit tests (service layer, repositories mocked) and `@WebMvcTest`s
(controller layer, services mocked) never touch a database and don't need
Docker. Repository (`@DataJpaTest`) and full integration
(`@SpringBootTest`) tests spin up a real Postgres via Testcontainers —
see §8 if that fails even though `docker info` works.

## 7. Creating Data Manually

Every write endpoint requires an `X-Domain` header (except `GET /domains`
and `GET /domains/{id}`). A minimal walkthrough — create a user, a
resource, a post, and a flag against the `imdb/bigotry` domain:

```bash
# 1. Create a test user (temporary /dev/users endpoint — no real auth yet)
curl -X POST http://localhost:8080/dev/users \
  -H "Content-Type: application/json" -H "X-Domain: imdb/bigotry" \
  -d '{"username":"jdoe","email":"jdoe@example.com"}'

# 2. Look up a seeded resource category
curl http://localhost:8080/resource-categories -H "X-Domain: imdb/bigotry"

# 3. Create a resource
curl -X POST http://localhost:8080/resources \
  -H "Content-Type: application/json" -H "X-Domain: imdb/bigotry" \
  -d '{"name":"tt0111161","displayName":"The Shawshank Redemption","categoryId":1}'

# 4. Create a post (unified endpoint — top-level since parentPostId is omitted)
curl -X POST http://localhost:8080/posts \
  -H "Content-Type: application/json" -H "X-Domain: imdb/bigotry" \
  -d '{"username":"jdoe","resourceId":1,"bodyText":"Worth a rewatch.","postTypeId":1,"score":0}'
```

For the full set of endpoints (replies, editing, deleting, flag removal,
rankings), see [`architecture.md`](./architecture.md) §5 — this section
intentionally only covers enough to confirm a fresh local instance works
end to end.

To load realistic bulk data instead of hand-crafting a few rows with curl,
the loaders in `backend/imdb-data-python` are normally run via Docker
(`docker compose run --rm imdb-loader --domain <name>`, or the
`./scripts/docker-load-*.sh` wrappers) — see the root `CLAUDE.md` and
`backend/imdb-data-python/CLAUDE.md`. Running them standalone without
Docker means installing that project's own Python dependencies and
pointing them at the Postgres connection from §3 directly; not covered
here since it's a separate component with its own local-run concerns.

## 8. Troubleshooting

- **`UnsupportedClassVersionError` / `release version 25 not supported`**
  — `JAVA_HOME` is pointed at an older JDK than this project's Java 25.
  Override per-command rather than changing it globally (§1).
- **Testcontainers-backed tests fail with `Previous attempts to find a
  Docker environment failed`, even though `docker info` succeeds** — a
  known friction point with Testcontainers' Docker auto-detection on some
  setups. Worth trying:
  ```bash
  export DOCKER_HOST=$(docker context inspect --format '{{.Endpoints.docker.Host}}')
  ```
  (`docker context ls` shows the active context if that doesn't resolve
  cleanly.) Not guaranteed to fix it. If it doesn't, skip Testcontainers
  tests locally and instead verify against a running instance directly —
  start this app per §4, then exercise it via `curl` (§7) or query
  Postgres directly.
- **`./mvnw spring-boot:run` can't connect to Postgres** — confirm
  Postgres is actually running (`pg_isready`, or `brew services list`) and
  that `posts-db` exists (`createdb posts-db`, §2). The `posts` *schema*
  inside that database is created automatically by Flyway — don't create
  it manually.
- **Port `8080` already in use** — another process (possibly the
  Dockerized `posts` container, if it's also running) is bound to it.
  Either stop it, or override this app's port:
  `SERVER_PORT=8081 ./mvnw spring-boot:run` — remember to point any
  frontend you're testing against at the new port.
- **CORS errors from a browser-based frontend** — confirm
  `app.cors.allowed-origins` (or `APP_CORS_ALLOWED_ORIGINS`) includes the
  exact origin the frontend is served from, including port (§3).
