# imdb-data-python

Three one-off scripts against the `posts-db` used by the [posts](../posts)
Spring Boot service. See `../posts/docs/design-spec.md` §4.3 for the target
schema.

- **`import_resources.py`** — imports a row range from a title.basics-formatted
  TSV into `posts.resource`.
- **`import_bigotry_data.py`** — imports resources the same way (idempotent:
  skips tconsts already present) plus seeds mock users `user1`/`user2`/
  `user3`, posts, threaded replies, and `post_flag` rows, for local testing
  of the bigotry-flagging UI. See its docstring and
  [`bigotry-config.yaml`](./bigotry-config.yaml) for options; run
  `./.venv/bin/python3 import_bigotry_data.py --help` for the full flag
  list.
- **`import_standard_data.py`** — the `imdb/standard` equivalent of
  `import_bigotry_data.py`: imports resources idempotently, plus seeds
  mock users `user1`/`user2`/`user3` and a small amount of posts/replies
  rated `skip-it`/`it-was-okay`/`i-enjoyed-it`/`i-loved-it` (fixed score of
  `0` — this domain has no severity to average). A separate script rather
  than a generalization of `import_bigotry_data.py` — see its docstring and
  `../imdb-data-python/CLAUDE.md`'s "Adding a new domain" for why. See its
  docstring and [`standard-config.yaml`](./standard-config.yaml) for
  options; run `./.venv/bin/python3 import_standard_data.py --help` for the
  full flag list.

All three default to [`sample-data/title.basics.sample.tsv`](./sample-data/title.basics.sample.tsv)
— a 5000-row subset (500 rows per `resource_category` title type,
`tt0000001`–`tt0260178`) checked into this repo, so each script runs with
no IMDB download required. Point `tsv_path`/`--tsv-path` at the real, full
`title.basics.tsv` instead for larger-scale imports (see
[Importing the full IMDB dataset](#importing-the-full-imdb-dataset)). All
three scripts also skip
rows whose `primaryTitle` is one of IMDB's generic placeholder episode
titles (e.g. `Episode #1.1`) — tens of thousands of `tvEpisode` rows have
no real title and aren't useful as mock post/reply subjects.

## Running with Docker

You don't need local Python for this. Each script runs as a one-off
compose job. The jobs are in the `tools` profile, so `docker compose up`
doesn't start them. Any arguments after the job name are passed to the
script as CLI flags.

| Job | Script | What it loads by default |
|---|---|---|
| `imdb-loader` | `import_resources.py` | Resources only, into the domain you pass with `--domain` |
| `bigotry-loader` | `import_bigotry_data.py` | `imdb/bigotry`: all 5000 sample rows, plus mock `user1`/`user2`/`user3` posts, replies and flags (`user1` posts least, `user3` most) |
| `standard-loader` | `import_standard_data.py` | `imdb/standard`: a 500-row slice, plus a few mock posts and replies |

**Easiest:** the wrapper scripts start `postgres` and `posts` (or reuse
them if they're already running), wait for the Flyway migrations, then
run the loader. They don't start the frontend, and they leave the
containers running when they finish.

```bash
./scripts/docker-load-bigotry-data.sh --total-posts 1000 --seed 42
./scripts/docker-load-standard-data.sh --total-posts 200 --seed 42
```

To seed while bringing up the whole stack, use
`./scripts/docker-run.sh bigotry-data`, `standard-data` or `--all`.

**When `postgres` and `posts` are already running**, run a job directly:

```bash
docker compose run --rm imdb-loader --domain imdb/bigotry
docker compose run --rm imdb-loader --start-row 1 --end-row 1000 --domain imdb/standard
docker compose run --rm bigotry-loader
docker compose run --rm standard-loader
```

- Use `imdb/bigotry` or `imdb/standard`, not `imdb`. Those are the
  domains the frontend sends. `resource_category` is scoped per domain,
  so each domain needs its own import.
- `imdb-loader` fails on tconsts that were already imported (see
  [Failure behavior](#failure-behavior)). To import more, use a later
  `--start-row`.
- `bigotry-loader` and `standard-loader` skip resources that already
  exist. Posts, replies and flags are not deduplicated, so every re-run
  adds another batch.

### Importing the full IMDB dataset

The bundled sample has 5000 rows. For more, download `title.basics.tsv`
from [IMDB's non-commercial datasets](https://datasets.imdbws.com/) into
this directory (it's git-ignored), then bind-mount it and point
`--tsv-path` at it. Run this from the repo root:

```bash
docker compose run --rm -v "$(pwd)/backend/imdb-data-python/title.basics.tsv:/app/full-title.basics.tsv:ro" \
  imdb-loader --tsv-path /app/full-title.basics.tsv --start-row 1 --end-row 50000 --domain imdb/bigotry
```

The same `-v` and `--tsv-path` work with `bigotry-loader` and
`standard-loader`. The wrapper scripts don't support them.

## Prerequisites

- Python 3.8+
- A running Postgres instance with the `posts` service's Flyway migrations
  already applied (so `posts.resource_category` and `posts.resource` exist)

## Setup

```bash
cd backend/imdb-data-python
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

## Configure

Edit [config.yaml](./config.yaml):

| Key | Meaning |
|---|---|
| `tsv_path` | Path to a title.basics-formatted TSV (relative paths resolve against this directory) — defaults to the bundled sample, see above |
| `start_row` / `end_row` | 1-indexed, inclusive row range to import, **not counting the header line** |
| `domain` | Domain name to import into (e.g. `imdb`, `imdb/bigotry`) — must already exist in `posts.domain`; `resource_category` lookups and the imported `resource` rows are scoped to it |
| `db_host`, `db_port`, `db_name`, `db_schema`, `db_user`, `db_password` | Must match `../posts/src/main/resources/application.yml` |

Any of these can be overridden per-run with a matching CLI flag instead of
editing the file — CLI flags win over `config.yaml`.

## Run

```bash
./.venv/bin/python3 import_resources.py
```

Or override specific values without touching the file:

```bash
./.venv/bin/python3 import_resources.py --start-row 1 --end-row 10000
./.venv/bin/python3 import_resources.py --domain imdb/bigotry --start-row 1 --end-row 10000
./.venv/bin/python3 import_resources.py --config other-config.yaml
./.venv/bin/python3 import_resources.py --db-host 127.0.0.1 --db-port 5433
```

Run `./.venv/bin/python3 import_resources.py --help` for the full flag list.

## What it does

For each row in the configured range:

- `tconst` → `resource.name`
- `primaryTitle` → `resource.display_name`
- `titleType` → `resource.category_id`, resolved against the
  `posts.resource_category` rows scoped to the configured `domain`
- `originalTitle`, `isAdult`, `startYear`, `endYear`, `runtimeMinutes`,
  `genres` → bundled into `resource.data` (jsonb)
- the configured `domain` → `resource.domain_id`

## Failure behavior

The whole range is imported as a single transaction — a failure partway
through leaves the table untouched, not partially populated.

- **Unknown `domain`** (no matching row in `posts.domain`): aborts
  immediately, before reading the TSV at all.
- **Unrecognized `titleType`** (no matching `resource_category` row *in
  that domain*): the script validates every row up front and aborts before
  writing anything if any titleType can't be mapped. Note that
  `resource_category` is itself domain-scoped, so importing into a domain
  with no seeded categories will report every row as unrecognized.
- **Duplicate `tconst`** (a `name` that already exists in `resource`,
  e.g. from re-running an overlapping range): the insert fails on the
  database's unique constraint and the whole batch rolls back — nothing
  from that run is committed.

To move past an already-imported range on a re-run, adjust `start_row` to
begin after the last row you previously imported.
