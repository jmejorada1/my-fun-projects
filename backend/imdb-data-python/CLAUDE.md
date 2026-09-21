# CLAUDE.md

[`README.md`](README.md) is the source of truth for setup, configuration,
usage, and failure behavior — read it before changing either script.
This file only covers what the README doesn't.

## What's here

Three one-off scripts against `posts-db` (`import_resources.py`,
`import_bigotry_data.py`, `import_standard_data.py`) — not long-running
services, not something with its own test suite (no `pytest`/`test_*.py`
exists here). Normally run through Docker, not a standalone venv — see
`docker-compose.yml`'s `imdb-loader`/`bigotry-loader`/`standard-loader`
services (`profiles: ["tools"]`, excluded from `docker compose up`, run
explicitly via `docker compose run --rm imdb-loader ...`). The venv/pip
setup in the README is for running a script directly against a DB
reachable from the host (e.g. the Docker-published Postgres port), not the
normal path.

`title.basics.tsv` / `title.basics.tsv.gz` sitting in this directory are
gitignored, multi-hundred-MB real IMDB downloads — don't try to read,
`grep -r` over, or commit them. The bundled `sample-data/` (a 5000-row
subset) is what both scripts use by default and is checked into git.

## Adding a new domain

`import_resources.py --domain <name>` already works for any domain that
has `resource_category` rows seeded (see the `posts` service's
`CLAUDE.md` — "Adding a new domain") — no change needed here.
`import_bigotry_data.py`'s synthetic users/posts/replies/flags are
bigotry-specific by design; a different domain wanting equivalent mock
data needs its own script, not a generalization of this one (that was a
deliberate choice — see
`frontend/imdb-ui-angular/docs/domain-configurability-plan.md` §11's
Phase 2b for the reasoning when `imdb/standard` was added).
`import_standard_data.py` is the `imdb/standard` example of this pattern:
it reuses `import_bigotry_data.py`'s generic DB helpers (`ensure_users`,
`create_post`, `create_flag`, `import_resources`, `split_by_weight` — the
users/posts/flags table shape doesn't vary by domain) but has its own
mock-content generation, since what a flag *means* does vary (fixed-score
rating categories, no severity/neutral-flag concept).
