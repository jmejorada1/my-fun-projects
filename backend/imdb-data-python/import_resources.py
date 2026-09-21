#!/usr/bin/env python3
"""Import a row range of title.basics.tsv into the posts-db `resource` table.

Config precedence: CLI flags override config.yaml, which overrides the
built-in defaults below (none — every value must come from one of the two).
"""

import argparse
import csv
import itertools
import re
import sys
from pathlib import Path

import psycopg2
import psycopg2.errors
import yaml
from psycopg2.extras import Json, execute_values

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG_PATH = SCRIPT_DIR / "config.yaml"
REQUIRED_KEYS = (
    "tsv_path",
    "start_row",
    "end_row",
    "domain",
    "db_host",
    "db_port",
    "db_name",
    "db_schema",
    "db_user",
    "db_password",
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Import a row range of title.basics.tsv into the resource table."
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG_PATH,
        help="Path to config.yaml (default: %(default)s)",
    )
    parser.add_argument("--tsv-path", dest="tsv_path", help="Path to title.basics.tsv")
    parser.add_argument(
        "--domain",
        dest="domain",
        help="Domain name to import into (e.g. imdb, imdb/bigotry) — resolved to a domain_id",
    )
    parser.add_argument(
        "--start-row",
        dest="start_row",
        type=int,
        help="First data row to import, 1-indexed, header not counted",
    )
    parser.add_argument(
        "--end-row",
        dest="end_row",
        type=int,
        help="Last data row to import, inclusive",
    )
    parser.add_argument("--db-host", dest="db_host")
    parser.add_argument("--db-port", dest="db_port", type=int)
    parser.add_argument("--db-name", dest="db_name")
    parser.add_argument("--db-schema", dest="db_schema")
    parser.add_argument("--db-user", dest="db_user")
    parser.add_argument("--db-password", dest="db_password")
    return parser.parse_args()


def load_config(args):
    file_config = {}
    if args.config.exists():
        with open(args.config) as f:
            file_config = yaml.safe_load(f) or {}

    config = dict(file_config)
    for key in REQUIRED_KEYS:
        cli_value = getattr(args, key, None)
        if cli_value is not None:
            config[key] = cli_value

    missing = [key for key in REQUIRED_KEYS if key not in config]
    if missing:
        sys.exit(
            "Missing required config values (set in {} or via CLI flags): {}".format(
                args.config, ", ".join(missing)
            )
        )
    if config["start_row"] < 1:
        sys.exit("start_row must be >= 1")
    if config["end_row"] < config["start_row"]:
        sys.exit("end_row must be >= start_row")

    tsv_path = Path(config["tsv_path"])
    if not tsv_path.is_absolute():
        tsv_path = SCRIPT_DIR / tsv_path
    config["tsv_path"] = tsv_path

    return config


def na_to_none(value):
    return None if value == r"\N" else value


# IMDB fills in a placeholder like "Episode #1.1" for tvEpisode rows whose
# real title isn't known — there are tens of thousands of these, and they're
# useless as mock post/reply subjects, so they're skipped on import rather
# than imported as unnamed resources.
GENERIC_EPISODE_TITLE_RE = re.compile(r"^episode[\s#-]*\d+(\.\d+)?$", re.IGNORECASE)


def is_generic_episode_title(title):
    return GENERIC_EPISODE_TITLE_RE.match(title) is not None


def parse_tsv_row(row):
    tconst, title_type, primary_title, original_title, is_adult, start_year, end_year, runtime_minutes, genres = row

    genres = na_to_none(genres)
    runtime_minutes = na_to_none(runtime_minutes)
    start_year = na_to_none(start_year)
    end_year = na_to_none(end_year)

    data = {
        "originalTitle": na_to_none(original_title),
        "isAdult": is_adult == "1",
        "startYear": int(start_year) if start_year is not None else None,
        "endYear": int(end_year) if end_year is not None else None,
        "runtimeMinutes": int(runtime_minutes) if runtime_minutes is not None else None,
        "genres": genres.split(",") if genres is not None else None,
    }
    return tconst, title_type, primary_title, data


def read_rows(tsv_path, start_row, end_row):
    with open(tsv_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
        next(reader)  # header
        for line_num, row in itertools.islice(
            enumerate(reader, start=1), start_row - 1, end_row
        ):
            parsed = parse_tsv_row(row)
            _tconst, _title_type, primary_title, _data = parsed
            if is_generic_episode_title(primary_title):
                continue
            yield line_num, parsed


def main():
    args = parse_args()
    config = load_config(args)

    conn = psycopg2.connect(
        host=config["db_host"],
        port=config["db_port"],
        dbname=config["db_name"],
        user=config["db_user"],
        password=config["db_password"],
        options=f"-c search_path={config['db_schema']}",
    )

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM domain WHERE name = %s", (config["domain"],))
                row = cur.fetchone()
                if row is None:
                    sys.exit(f"Aborting: domain '{config['domain']}' not found — nothing was imported.")
                domain_id = row[0]

                cur.execute("SELECT name, id FROM resource_category WHERE domain_id = %s", (domain_id,))
                category_ids = dict(cur.fetchall())

            rows = list(read_rows(config["tsv_path"], config["start_row"], config["end_row"]))
            if not rows:
                sys.exit("No rows found in the requested range — check start_row/end_row.")

            unmapped = [
                (line_num, title_type)
                for line_num, (_, title_type, _, _) in rows
                if title_type not in category_ids
            ]
            if unmapped:
                details = "\n".join(
                    f"  row {line_num}: titleType={title_type!r}" for line_num, title_type in unmapped
                )
                sys.exit(
                    "Aborting: found titleType values with no matching resource_category "
                    f"row. Nothing was imported.\n{details}"
                )

            values = [
                (tconst, primary_title, category_ids[title_type], domain_id, Json(data))
                for _, (tconst, title_type, primary_title, data) in rows
            ]

            with conn.cursor() as cur:
                execute_values(
                    cur,
                    "INSERT INTO resource (name, display_name, category_id, domain_id, data) VALUES %s",
                    values,
                )
    except psycopg2.errors.UniqueViolation as e:
        sys.exit(f"Aborting: duplicate resource(s) already exist — nothing was imported.\n{e.pgerror}")
    finally:
        conn.close()

    print(f"Imported {len(rows)} rows (source rows {config['start_row']}-{config['end_row']}).")


if __name__ == "__main__":
    main()
