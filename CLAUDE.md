# CLAUDE.md

Guidance for Claude Code working in this repo. Each component also has its
own `CLAUDE.md` with component-specific detail — this file covers the
cross-cutting stuff: what the system does, how the pieces fit together,
and the Docker/local-dev workflow that spans all of them.

## What this is

Users flag IMDB titles (movies, TV, video games) with categorized,
severity-scored posts (`racism`/`sexism`/`lgbtq-phobic`, or a `no-bigotry`
counter-flag) and reply in threaded comments underneath — the
`imdb/bigotry` domain. A second domain, `imdb/standard`, is a plain
"skip it / it was okay / I enjoyed it / I loved it" rating with no
severity score, just counts. Both are the same underlying schema/app,
scoped by a domain concept that runs end to end (DB → API → frontend) —
see [`backend/posts/docs/design-spec.md`](backend/posts/docs/design-spec.md)
for the data model and
[`frontend/imdb-ui-angular/docs/architecture.md`](frontend/imdb-ui-angular/docs/architecture.md)
for how a domain's UI behavior (rating mode, skin, business rules) is
configured on the frontend side.

## Components — each has its own CLAUDE.md, read it before working there

| Component | Path | Stack |
|---|---|---|
| API | [`backend/posts`](backend/posts) | Spring Boot 4 / Java 25 — **fully implemented**, not a scaffold (entities, repos, services, controllers, Flyway migrations through V17+ all exist) |
| Frontend | [`frontend/imdb-ui-angular`](frontend/imdb-ui-angular) | Angular 22, standalone components + Signals, Vitest (not Karma/Jasmine) |
| Data loaders | [`backend/imdb-data-python`](backend/imdb-data-python) | Python one-off scripts, normally run via Docker, not standalone |

`deploy/kubernetes/` is an empty placeholder for a stated future goal, not
in-progress work. `deploy/docker/requirements.txt` isn't a Python
requirements file despite the name — it's the original planning notes for
*this repo's* docker-compose setup (see git history / commit "chore: added
docker setup"). Don't treat either as existing deployment tooling.

## Running the stack (Docker)

Full details: [root README.md](README.md). Short version:

```bash
./scripts/docker-run.sh                             # precheck, build, up (foreground)
./scripts/docker-run.sh bigotry-data                # same, detached, then seeds imdb/bigotry mock data
./scripts/docker-run.sh standard-data               # same, detached, then seeds imdb/standard mock data
./scripts/docker-run.sh bigotry-data standard-data  # same, detached, then seeds both
./scripts/docker-run.sh --all                       # same, detached, then seeds both (shorthand)
./scripts/docker-reload.sh [frontend|backend]  # rebuild+redeploy without the port precheck
./scripts/docker-shutdown.sh [--all] # down, optionally -v (wipes the DB volume)
./scripts/docker-hard-clean.sh       # down -v --rmi all --remove-orphans, standalone teardown only
./scripts/docker-clean-rebuild.sh [args forwarded to docker-run.sh]
    # docker-hard-clean.sh, then build --no-cache, then docker-run.sh — full from-scratch reset, prints elapsed time
```

Compose v2 syntax throughout (`docker compose ...`, no hyphen) — this repo
does not use the older `docker-compose` binary.

**Ports and the CORS/API-URL config are centralized in `.env`** (copy from
[`.env.example`](.env.example): `FRONTEND_PORT`, `API_PORT`,
`POSTGRES_PORT`, `POSTGRES_PASSWORD`). Optional — every default is baked
into `docker-compose.yml` if `.env` doesn't exist. Changing a port there
is a one-line edit, not a hunt across files: `docker-compose.yml`'s port
mappings, `posts`' CORS origin (`APP_CORS_ALLOWED_ORIGINS`), the
frontend's own API base URL (generated into `/config.json` at *container
startup*, not baked into the image — see
[`frontend/imdb-ui-angular/docker-entrypoint.sh`](frontend/imdb-ui-angular/docker-entrypoint.sh)
and
[`frontend/imdb-ui-angular/src/app/core/api-config.ts`](frontend/imdb-ui-angular/src/app/core/api-config.ts)),
and `scripts/docker-{precheck,run,reload}.sh`'s port-freeness checks all
derive from these same three variables. The one exception: `posts`'
`SPRING_DATASOURCE_URL` — already env-overridden by
`docker-compose.yml`, same relaxed-binding mechanism, but not tied to the
`.env` port variables since it's an internal container-to-container URL,
not a host-published port.

Loading data (`imdb-loader`, `bigotry-loader`, `standard-loader`) —
one-off jobs, excluded from `up` via Compose's `tools` profile:

```bash
docker compose run --rm imdb-loader --domain imdb/bigotry
docker compose run --rm imdb-loader --domain imdb/standard
docker compose run --rm bigotry-loader          # mock users/posts/replies/flags for imdb/bigotry
docker compose run --rm standard-loader         # mock users/posts/replies for imdb/standard
./scripts/docker-load-bigotry-data.sh           # same bigotry-loader, standalone (spins up postgres+posts itself)
./scripts/docker-load-standard-data.sh          # same standard-loader, standalone (spins up postgres+posts itself)
```

Each domain needs its own `resource` import (`resource_category` is
scoped per domain) — `imdb-loader --domain <name>` is already generic, no
domain-specific loader needed there. Mock posts/replies/flags *are*
domain-specific by design (a domain's flags mean different things — see
`backend/imdb-data-python/CLAUDE.md`'s "Adding a new domain"), so
`bigotry-loader`/`standard-loader` are separate scripts, not a shared one.

## Environment gotchas hit while working in this repo

- **`JAVA_HOME` may point at an old JDK.** If `./mvnw` (run outside
  Docker) fails with `UnsupportedClassVersionError`, check `JAVA_HOME` —
  it may be pinned to an older JDK than this project's `java.version` (25).
  Override for one command rather than changing it globally:
  `JAVA_HOME=/path/to/jdk-25 ./mvnw test`. Find installed JDKs with
  `/usr/libexec/java_home -V` (macOS).
- **Testcontainers may not reach Docker Desktop's socket**, even when the
  `docker` CLI itself works fine (`docker info` succeeds) — fails with
  `Previous attempts to find a Docker environment failed`. Setting
  `DOCKER_HOST` to the active context's actual socket
  (`docker context ls` shows it) is worth trying, but isn't guaranteed to
  fix it. If `./mvnw test`'s Testcontainers-backed tests won't run in this
  environment, fall back to verifying against the real `docker compose`
  stack directly (`docker compose up -d postgres posts`, then
  `scripts/docker-wait-for-posts.sh`, then query the DB or hit the API
  with `curl`) — that path doesn't depend on Testcontainers' Docker
  auto-detection at all.
- **Docker Desktop can quit unexpectedly** mid-session (the daemon becomes
  unreachable, `docker info` fails, no process running) — this is an
  external environment issue, not something to work around by relaunching
  a GUI app unprompted. Surface it and wait for the user to restart it.

## Code Style & Rules
- **Angular:** Strict TypeScript typing (`noImplicitAny`). Use standalone components.
- **Java:** Follow standard Spring Boot idioms. Use Lombok to reduce boilerplate. Match existing package structure.
- **Python:** Adhere to PEP 8 standards. Include explicit type hints for function arguments and returns.
- **Docker:** Optimize layers; keep images lightweight (alpine/slim bases). Use non-root users where practical.

## Token Optimization
- Keep conversation turns short. If debugging a complex bug, use `/compact` if the session warning triggers.
- Run `/clear` when shifting focus between frontend, backend, or Docker tasks to avoid carrying dead history forward.
