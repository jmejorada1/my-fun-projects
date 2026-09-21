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
`title.basics.tsv` instead for larger-scale imports (see "Loading IMDB
data" in the [root README](../../README.md)). All three scripts also skip
rows whose `primaryTitle` is one of IMDB's generic placeholder episode
titles (e.g. `Episode #1.1`) — tens of thousands of `tvEpisode` rows have
no real title and aren't useful as mock post/reply subjects.

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
