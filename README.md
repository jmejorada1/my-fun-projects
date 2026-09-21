# my-fun-projects

Users flag IMDB titles (movies, TV, video games) with categorized,
severity-scored posts — e.g. `racism`, `sexism`, `lgbtq-phobic`, or a
`no-bigotry` counter-flag — and reply in threaded comments underneath. See
[`backend/posts/docs/design-spec.md`](backend/posts/docs/design-spec.md) for
the full domain model.

## Architecture

```
                     ┌─────────────────────┐
   browser  ───────► │ frontend             │  Angular (nginx), :4200
                      │ imdb-ui-angular      │
                      └──────────┬───────────┘
                                 │ REST (browser → :8080 directly)
                                 ▼
                      ┌───────────────────────┐
                      │ posts                 │  Spring Boot, :8080
                      │ backend/posts         │  Flyway migrations on boot
                      └──────────┬─────────────┘
                                 │ JDBC
                                 ▼
                      ┌───────────────────────┐
   one-off  ───────►  │ postgres              │  :5432
   data load          │ posts-db / posts schema│
   (imdb-loader)      └───────────────────────┘
```

| Component | Path | Stack | Role |
|---|---|---|---|
| `posts` | [`backend/posts`](backend/posts) | Spring Boot 4 / Java 25 | REST API for resources, posts, replies, and flags. Owns the schema via Flyway migrations, applied automatically on startup. |
| `imdb-ui-angular` | [`frontend/imdb-ui-angular`](frontend/imdb-ui-angular) | Angular 22 | SPA served as static files via nginx. Calls `posts` directly from the browser. |
| `imdb-data-python` | [`backend/imdb-data-python`](backend/imdb-data-python) | Python | One-off scripts: `import_resources.py` imports a row range of IMDB's `title.basics.tsv` into the `posts-db.resource` table; `import_bigotry_data.py` additionally seeds mock users, posts, replies, and flags. Neither is a long-running service. |
| `postgres` | — | Postgres 16 | Single database (`posts-db`), single schema (`posts`), owned by the `posts` service's migrations. |

Two things wire the pieces together and are **not** overridden in Docker,
by design — keeping them as-is meant zero changes to the existing
codebases:

- The frontend calls the API at `http://localhost:8080`
  ([`api-config.ts`](frontend/imdb-ui-angular/src/app/core/api-config.ts))
  — this works from a container because it's the *browser*, not the
  frontend container, making the call, straight to the host's published
  `8080` port.
- `posts` only allows CORS from `http://localhost:4200`
  ([`application.yml`](backend/posts/src/main/resources/application.yml))
  — which is why the frontend container is published on host port `4200`,
  not some other port.

The database connection *is* overridden — via Spring Boot's environment
variable binding (`SPRING_DATASOURCE_URL`, etc. in
[`docker-compose.yml`](docker-compose.yml)) — since `application.yml`
otherwise points at `localhost`, which doesn't resolve to the `postgres`
container from inside `posts`.

## Prerequisites

- **Docker Desktop** (or Docker Engine + the Compose v2 plugin), running
  locally — `docker compose version` should print something. That's the
  only install required; Java, Maven, Node, and Python all run inside the
  containers, not on your machine.
- **Ports `4200` and `8080` free** on the host — `docker compose up`
  publishes the frontend and API on those exact ports, so a locally-running
  `ng serve` or `./mvnw spring-boot:run` will collide with it. Stop those
  first if you have them running. (Postgres is published on `5433`, not
  `5432`, specifically so it *doesn't* need to fight a local Postgres
  install — a pgAdmin session pointed at your own local database is fine
  to leave running.)
- **Nothing else to download** — `imdb-loader`/`bigotry-loader` (below) run
  against a 5000-row sample of IMDB's `title.basics.tsv` checked into the
  repo. A `title.basics.tsv` download is only needed if you want to import
  the real, full dataset instead (see "Loading IMDB data" below).

## How to run (Docker)

1. Start the app:

   ```bash
   ./scripts/docker-run.sh
   ```

   This runs [`docker-precheck.sh`](scripts/docker-precheck.sh) first —
   catching a not-running Docker daemon, a broken compose file, or a
   collided port with a specific fix instead of a raw Docker error — then,
   if that passes, `docker compose build` followed by `docker compose up`,
   which builds and starts `postgres`, `posts` (runs its Flyway migrations
   automatically on boot), and `frontend`. Any arguments you pass are
   forwarded to that `up` command, e.g. `./scripts/docker-run.sh -d` to run
   detached, or `./scripts/docker-run.sh posts` to start just one service.

   Pass `bigotry-data` (anywhere in the arguments) to also seed mock
   `imdb/bigotry` data — resources plus `user1`/`user2`/`user3`
   posts/replies/flags — right after startup:

   ```bash
   ./scripts/docker-run.sh bigotry-data
   ```

   This one forces the stack up detached (so the seeding job can run
   against it, regardless of any other arguments) and leaves it running in
   the background afterward — see "Seeding mock bigotry data" below for
   what gets loaded and how to load more later.

   (Or run the steps yourself: `./scripts/docker-precheck.sh`, then
   `docker compose build`, then `docker compose up`. `up --build` in one
   shot also works if your Compose version supports it — the bundled one
   in older Docker Desktop installs doesn't.)

2. Open the app:

   - Frontend: <http://localhost:4200>
   - API / Swagger UI: <http://localhost:8080/swagger-ui.html>

3. Stop the app:

   ```bash
   ./scripts/docker-shutdown.sh          # keeps the database volume
   ./scripts/docker-shutdown.sh --all    # also wipes the database
   ```

   (Equivalent to `docker compose down` / `docker compose down -v`, if you
   prefer to run those directly.)

4. Made a code change and want it live without restarting everything?

   ```bash
   ./scripts/docker-reload.sh            # rebuild + redeploy both frontend and posts
   ./scripts/docker-reload.sh frontend   # frontend only
   ./scripts/docker-reload.sh backend    # posts only
   ```

   Unlike `docker-run.sh`, this skips the port-free precheck (which would
   otherwise fail since the running stack's own containers already hold
   those ports) and only touches the service(s) you name, leaving the
   database and everything else untouched.

No `.env` file is required — the stack runs with the same default DB
password already in `application.yml`. To use a different one, copy
[`.env.example`](.env.example) to `.env` and edit `POSTGRES_PASSWORD`.

### Loading IMDB data

`imdb-loader` is a one-off job, not a service that starts with `up` — run
it explicitly whenever you want to (re-)import a row range. It's
self-contained by default: it reads from the 5000-row sample TSV checked
into [`backend/imdb-data-python/sample-data/`](backend/imdb-data-python/sample-data/)
(no download needed), and its default `start_row`/`end_row` (1-5000)
imports that entire sample:

1. Make sure `postgres` and `posts` are already running (step 1 above).
2. Run the loader — with no arguments it imports the whole bundled sample,
   or pass a narrower range/different domain, which become CLI flags on
   [`import_resources.py`](backend/imdb-data-python/import_resources.py):

   ```bash
   docker compose run --rm imdb-loader --domain imdb/bigotry
   docker compose run --rm imdb-loader --start-row 1 --end-row 1000 --domain imdb/bigotry
   ```

   Use `imdb/bigotry`, not `imdb` — it's the only domain the frontend's
   domain picker actually sends
   ([`domain-options.ts`](frontend/imdb-ui-angular/src/app/core/domain-options.ts)),
   so that's what needs the resource data.

   Re-run with a later `--start-row` to import further ranges; see
   [`backend/imdb-data-python/README.md`](backend/imdb-data-python/README.md)
   for the full flag list and failure behavior.

   To import beyond the bundled sample's 5000 rows, download the real,
   full `title.basics.tsv` from
   [IMDB's non-commercial datasets](https://datasets.imdbws.com/) into
   `backend/imdb-data-python/`, then bind-mount it in ad hoc and point
   `--tsv-path` at it:

   ```bash
   docker compose run --rm -v "$(pwd)/backend/imdb-data-python/title.basics.tsv:/app/full-title.basics.tsv:ro" \
     imdb-loader --tsv-path /app/full-title.basics.tsv --start-row 1 --end-row 50000 --domain imdb/bigotry
   ```

### Seeding mock bigotry data

`bigotry-loader` is a second one-off job, also excluded from `up`, that
seeds `imdb/bigotry` with the entire 5000-row bundled sample as resources
plus mock users `user1`/`user2`/`user3` and synthetic posts, replies, and
flags for local UI testing — `user1` posts least, `user3` posts most.

The easiest way to run it, standalone, without the rest of the stack
already up:

```bash
./scripts/docker-load-bigotry-data.sh
```

[`docker-load-bigotry-data.sh`](scripts/docker-load-bigotry-data.sh) starts
(or reuses) just `postgres` + `posts` — enough for Flyway migrations to
apply — then runs `bigotry-loader`; the frontend is never started. Any
arguments are forwarded to the loader, e.g.
`./scripts/docker-load-bigotry-data.sh --total-posts 1000 --seed 42`.

(Or, if `postgres`/`posts` are already running via `./scripts/docker-run.sh`,
run the job directly: `docker compose run --rm bigotry-loader`.)

These become CLI flags on
[`import_bigotry_data.py`](backend/imdb-data-python/import_bigotry_data.py);
see that script's docstring and
[`bigotry-config.yaml`](backend/imdb-data-python/bigotry-config.yaml) for
the full option list. Resource import is idempotent (already-imported
tconsts are skipped), but posts/replies/flags are not — re-running adds
another batch on top of what's already there.

### Rebuilding after code changes

```bash
./scripts/docker-run.sh <service-name>      # e.g. ./scripts/docker-run.sh posts
# or, without the precheck:
docker compose build <service-name> && docker compose up <service-name>
```
