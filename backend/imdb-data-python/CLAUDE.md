# CLAUDE.md — data loaders

[`README.md`](README.md) is the source of truth for setup, config, usage,
and failure behavior. This file covers only what it doesn't.

- There are three one-off scripts that write to `posts-db`:
  `import_resources.py`, `import_bigotry_data.py`, and
  `import_standard_data.py`. Tests go in `tests/` (pytest; none exist
  yet). Mock the `psycopg2` connection rather than needing Postgres. Run
  them with `pip install -r requirements-dev.txt && python -m pytest`,
  or through `scripts/quality-gate.sh loaders`.
- They normally run as the compose `tools` services (see root
  `CLAUDE.md`). The README's venv setup is only for running a script
  directly against the host-published Postgres port.
- **Never read, grep, or commit `title.basics.tsv(.gz)`.** These are
  gitignored IMDB dumps of several hundred MB. Scripts default to the
  committed `sample-data/` (5000 rows).
- Code style: PEP 8, with explicit type hints on function arguments and
  return values.

## Adding a new domain

`import_resources.py --domain <name>` already works for any domain whose
`resource_category` rows are seeded. Mock-data scripts are **per-domain
by design**, because a flag means different things in each domain. For
a new domain, write a new script modeled on `import_standard_data.py`.
Reuse the generic DB helpers from `import_bigotry_data.py`
(`ensure_users`, `create_post`, `create_flag`, `import_resources`,
`split_by_weight`), and write that domain's own mock-content generation.
