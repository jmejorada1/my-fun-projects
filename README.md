<p align="center">
  <img src="assets/banner.svg" alt="my-fun-projects — built purely for the fun of it" width="720">
</p>

<p align="center">
  <img alt="just for fun" src="https://img.shields.io/badge/purpose-just%20for%20fun-ff5f6d?style=for-the-badge">
  <img alt="no pressure" src="https://img.shields.io/badge/pressure-zero-3bd6c6?style=for-the-badge">
</p>

**👉 First time here? [QUICKSTART.md](QUICKSTART.md) gets the full stack
running in Docker, with mock data, in a few minutes.**

A domain-partitioned discussion platform. Users post about catalog items
and reply in threaded comments. Each **domain** defines its own flag or
rating categories, and a new domain plugs into the same backend and
schema without a code change
([how it works](OVERALL-ARCHITECTURE.md#3-pluggable-domain-model)). Two
domains are implemented, both on IMDB's catalog:

- **`imdb/bigotry`**: content flags (`racism`, `sexism`, `lgbtq-phobic`)
  with a 0–5 severity, or a `no-bigotry` counter-flag.
- **`imdb/standard`**: a plain rating with no severity: `skip-it`,
  `it-was-okay`, `i-enjoyed-it` or `i-loved-it`.

## Documentation

| To... | Read |
|---|---|
| Run the stack and click around | [QUICKSTART.md](QUICKSTART.md), then the [UI user guide](frontend/imdb-ui-angular/docs/user-guide.md) |
| Understand the system design | [OVERALL-ARCHITECTURE.md](OVERALL-ARCHITECTURE.md) |
| Understand the data model | [`backend/posts/docs/design-spec.md`](backend/posts/docs/design-spec.md) |
| Load IMDB titles or mock data | [`backend/imdb-data-python/README.md`](backend/imdb-data-python/README.md#running-with-docker) |
| Run on local Kubernetes | [`deploy/kubernetes/README.md`](deploy/kubernetes/README.md) |
| Run one component without Docker | [posts](backend/posts/docs/running-locally.md), [Angular UI](frontend/imdb-ui-angular/docs/running-locally.md) |
| Understand metrics and monitoring | [MONITORING-ARCHITECTURE.md](MONITORING-ARCHITECTURE.md), [`observability.md`](backend/posts/docs/observability.md) |
| Review security findings | [SECURITY-CONSIDERATIONS.md](SECURITY-CONSIDERATIONS.md) |
| Use the agent feature pipeline | [AGENT-PIPELINE.md](AGENT-PIPELINE.md) |

## Architecture

| Component | Path | Stack | Role |
|---|---|---|---|
| `posts` | [`backend/posts`](backend/posts) | Spring Boot 4 / Java 25 | REST API for resources, posts, replies and flags. Owns the schema; Flyway migrations run on startup. |
| `imdb-ui-angular` | [`frontend/imdb-ui-angular`](frontend/imdb-ui-angular) | Angular 22 | SPA served by nginx. Calls `posts` from the browser. |
| `imdb-data-python` | [`backend/imdb-data-python`](backend/imdb-data-python) | Python | One-off jobs that import IMDB titles and seed mock data. Not long-running services. |
| `postgres` | — | Postgres 16 | One database (`posts-db`), one schema (`posts`), owned by `posts`' migrations. |
| `prometheus`, `grafana` | [`deploy/docker`](deploy/docker) | — | Metrics scraping and dashboards for `posts`. |

How the containers connect:
[container topology diagram](OVERALL-ARCHITECTURE.md#2-container-topology).

## Running with Docker

Requirements are listed in QUICKSTART's
[System Requirements](QUICKSTART.md#system-requirements). Run every
script from the repo root.

| Command | What it does |
|---|---|
| `./scripts/docker-run.sh [args]` | Checks the Docker daemon, compose file and ports, then builds and starts the stack. Extra args go to `docker compose up` (e.g. `-d`, or service names). Add `bigotry-data`, `standard-data` or `--all` (both) to seed mock data; this also runs the stack detached. |
| `./scripts/docker-reload.sh [frontend\|backend]` | Rebuilds and redeploys `frontend`, `posts` or both (the default) in a running stack. Skips the port check and leaves the database alone. |
| `./scripts/docker-shutdown.sh [--all]` | Stops the stack. Keeps the database volume unless you pass `--all`. |
| `./scripts/docker-hard-clean.sh [-y]` | Removes containers, networks, the database volume and every image this project built or pulled. Asks for confirmation unless `-y`. |
| `./scripts/docker-clean-rebuild.sh [-y] [run args]` | Hard-clean, then `build --no-cache`, then `docker-run.sh` with the remaining args. Leaves Docker's global build cache alone (`docker builder prune -f` clears it). |
| `./scripts/docker-load-bigotry-data.sh`, `docker-load-standard-data.sh` | Seed one domain without starting the frontend. See the [data loader docs](backend/imdb-data-python/README.md#running-with-docker). |

Default URLs:

- Frontend: <http://localhost:4200>
- API / Swagger UI: <http://localhost:8080/swagger-ui.html>
- Grafana: <http://localhost:3000> and Prometheus: <http://localhost:9090>
  (see [Metrics & Monitoring](#metrics--monitoring))
- Postgres: `localhost:5433`, so a local Postgres on `5432` isn't in the way

### Configuration (`.env`)

No `.env` is needed; the defaults work as they are. To change a port or
password, copy [`.env.example`](.env.example) to `.env` and edit it.
`.env` is the only place ports are defined. The compose port mappings,
`posts`' CORS origin, the frontend's API URL and the scripts' port checks
all read from it. The frontend reads its API URL when the container
starts, not at build time, so changing `API_PORT` needs a restart rather
than a rebuild
([runtime config](OVERALL-ARCHITECTURE.md#2-container-topology)).

## Running on Kubernetes (local)

The same stack also runs on Docker Desktop's built-in Kubernetes, served
from one origin: the UI at `http://localhost:${FRONTEND_PORT}` and the API
under `/api`. Run one stack at a time. Stop compose before starting k8s,
and stop k8s before starting compose.

```bash
./scripts/k8s-run.sh --all       # deploy + seed both domains
./scripts/k8s-smoke-test.sh      # curl checks against the running app
./scripts/k8s-shutdown.sh        # stop (keeps data); --all wipes it
```

Setup, every script, and troubleshooting are in
[`deploy/kubernetes/README.md`](deploy/kubernetes/README.md). The design is
in [`docs/specs/kubernetes-local/spec.md`](docs/specs/kubernetes-local/spec.md).

## Metrics & Monitoring

`posts` exports [Micrometer](https://micrometer.io) metrics in Prometheus
format, and `prometheus` and `grafana` start with the rest of the stack.

- **Grafana** (<http://localhost:3000>, `admin` / `admin`) comes with a
  provisioned "posts — JVM & HTTP overview" dashboard. Set
  `GRAFANA_ADMIN_PASSWORD` in `.env` before running it anywhere other
  machines can reach.
- **Prometheus** (<http://localhost:9090>) scrapes `posts` every 15s.
- **`posts`' Actuator endpoints** (`/actuator/health`, `/actuator/prometheus`)
  are on management port `8081`, which is deliberately **not** published
  to the host. Only containers on the compose network (`prometheus`) can
  reach it. The reasons are in
  [The Management-Port Split](MONITORING-ARCHITECTURE.md#3-the-management-port-split).
  When you run `posts` outside Docker, it's at
  <http://localhost:8081/actuator/health>.

Day-to-day use (querying, adding metrics, editing the dashboard) is in
[`observability.md`](backend/posts/docs/observability.md).
