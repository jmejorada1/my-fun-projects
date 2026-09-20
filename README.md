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
| `imdb-data-python` | [`backend/imdb-data-python`](backend/imdb-data-python) | Python | One-off script that imports a row range of IMDB's `title.basics.tsv` into the `posts-db.resource` table. Not a long-running service. |
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
- **To load IMDB data** (optional, only needed for the `imdb-loader` job
  below): `title.basics.tsv` downloaded from
  [IMDB's non-commercial datasets](https://datasets.imdbws.com/) — it's
  ~1GB and gitignored, so it isn't in the repo.

## How to run (Docker)

1. Start the app:

   ```bash
   ./docker-run.sh
   ```

   This runs [`docker-precheck.sh`](docker-precheck.sh) first — catching a
   not-running Docker daemon, a broken compose file, or a collided port
   with a specific fix instead of a raw Docker error — then, if that
   passes, `docker compose build` followed by `docker compose up`, which
   builds and starts `postgres`, `posts` (runs its Flyway migrations
   automatically on boot), and `frontend`. Any arguments you pass are
   forwarded to that `up` command, e.g. `./docker-run.sh -d` to run
   detached, or `./docker-run.sh posts` to start just one service.

   (Or run the steps yourself: `./docker-precheck.sh`, then
   `docker compose build`, then `docker compose up`. `up --build` in one
   shot also works if your Compose version supports it — the bundled one
   in older Docker Desktop installs doesn't.)

2. Open the app:

   - Frontend: <http://localhost:4200>
   - API / Swagger UI: <http://localhost:8080/swagger-ui.html>

3. Stop the app:

   ```bash
   ./docker-shutdown.sh          # keeps the database volume
   ./docker-shutdown.sh --all    # also wipes the database
   ```

   (Equivalent to `docker compose down` / `docker compose down -v`, if you
   prefer to run those directly.)

No `.env` file is required — the stack runs with the same default DB
password already in `application.yml`. To use a different one, copy
[`.env.example`](.env.example) to `.env` and edit `POSTGRES_PASSWORD`.

### Loading IMDB data

`imdb-loader` is a one-off job, not a service that starts with `up` — run
it explicitly whenever you want to (re-)import a row range:

1. Download `title.basics.tsv` (from IMDB's non-commercial datasets) into
   `backend/imdb-data-python/`.
2. Make sure `postgres` and `posts` are already running (step 1 above).
3. Run the loader, passing whatever range/domain you need — these become
   CLI flags on [`import_resources.py`](backend/imdb-data-python/import_resources.py):

   ```bash
   docker compose run --rm imdb-loader --start-row 1 --end-row 10000 --domain imdb/bigotry
   ```

   Use `imdb/bigotry`, not `imdb` — it's the only domain the frontend's
   domain picker actually sends
   ([`domain-options.ts`](frontend/imdb-ui-angular/src/app/core/domain-options.ts)),
   so that's what needs the resource data.

   Re-run with a later `--start-row` to import further ranges; see
   [`backend/imdb-data-python/README.md`](backend/imdb-data-python/README.md)
   for the full flag list and failure behavior.

### Rebuilding after code changes

```bash
./docker-run.sh <service-name>              # e.g. ./docker-run.sh posts
# or, without the precheck:
docker compose build <service-name> && docker compose up <service-name>
```
