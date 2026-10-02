# CLAUDE.md

Cross-cutting guidance. Each component has its own `CLAUDE.md` — read it
before working there.

## What this is

Users post about IMDB titles and reply in threaded comments, scoped by a
**domain** that runs end to end (DB → API → frontend):
- `imdb/bigotry`: posts are flagged `racism`/`sexism`/`lgbtq-phobic` with
  a 0–5 severity, or with a `no-bigotry` counter-flag.
- `imdb/standard`: a plain skip-it → loved-it rating, counted and not
  scored.

## Components

| Component | Path | Stack |
|---|---|---|
| API | [`backend/posts`](backend/posts) | Spring Boot 4 / Java 25, fully implemented |
| Frontend | [`frontend/imdb-ui-angular`](frontend/imdb-ui-angular) | Angular 22, standalone + Signals, Vitest |
| Data loaders | [`backend/imdb-data-python`](backend/imdb-data-python) | One-off Python scripts, run via Docker |

`deploy/kubernetes/` is an empty placeholder. `deploy/docker/requirements.txt`
holds the original docker-compose planning notes, not Python deps.
Neither is live tooling.

## Running the stack (Docker)

Details are in [README.md](README.md). Use Compose v2 (`docker compose`,
not `docker-compose`).

```bash
./scripts/docker-run.sh [bigotry-data] [standard-data] [--all]  # precheck, build, up; seed flags imply detached
./scripts/docker-reload.sh [frontend|backend]   # rebuild + redeploy, no port precheck
./scripts/docker-shutdown.sh [--all]            # down; --all also wipes the DB volume
./scripts/docker-hard-clean.sh                  # down -v --rmi all --remove-orphans
./scripts/docker-clean-rebuild.sh [run args]    # hard-clean, build --no-cache, docker-run
docker compose run --rm imdb-loader --domain <imdb/bigotry|imdb/standard>
docker compose run --rm bigotry-loader | standard-loader   # mock data ("tools" profile, not started by up)
```

**Ports live only in `.env`** (see [`.env.example`](.env.example); the
defaults are in `docker-compose.yml`). `FRONTEND_PORT`, `API_PORT` and
`POSTGRES_PORT` drive the compose port mappings, the posts CORS origin,
the frontend's runtime API URL, and the port checks in the scripts. Change
a port in `.env`, never in individual files.

**Docker Desktop can quit mid-session** (`docker info` fails). If it
does, tell the user and wait. Don't relaunch it yourself.

## Quality gates and feature pipeline

- `./scripts/quality-gate.sh [--unit-only]`: runs the touched components'
  tests and fails if under 85% of lines changed since `main` are covered.
- `./scripts/security-scan.sh`: Semgrep plus osv-scanner, run in Docker.
- CI runs both on every PR.
- `/feature-pipeline <requirements-file>` runs spec → implement+tests →
  parallel security/code review → fixes, using `.claude/agents/`. See
  [`AGENT-PIPELINE.md`](AGENT-PIPELINE.md#5-triggering-options).

## Repo-wide rules

- Docker images: slim/alpine bases, cache-friendly layer order, non-root
  users where practical.
- When requirements or design intent are unclear, ask, or record an open
  question in the relevant spec doc. Don't silently pick a default. Point
  out any doc/code inconsistency or better approach you notice.

## Design principles

- **KISS:** the simplest code that fully meets the requirement. Boring
  over clever: no speculative abstractions, no generic frameworks for one
  use case, no new libraries without a clear reason.
- **SOLID, where it pays off:** one responsibility per class, constructor
  injection, interfaces only at real seams (repositories, external clients).
- **DRY, by the rule of three:** look for an existing helper, mapper or
  validator before writing one. Extract shared code once the same logic
  appears a third time, not before.
- When these conflict, KISS wins: a little duplication beats the wrong
  abstraction.
