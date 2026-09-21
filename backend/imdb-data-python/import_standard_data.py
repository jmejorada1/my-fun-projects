#!/usr/bin/env python3
"""Seed the imdb/standard domain with resources plus mock users, posts, and
replies, for local/dev testing of the plain-rating UI.

Reuses import_resources.py's TSV parsing for the resource-import step (same
title.basics.tsv row range) and import_bigotry_data.py's generic DB helpers
(users/posts/flags are the same shape across domains — only *what a flag
means* differs), then layers on synthetic posts/replies authored by three
mock users (user1/user2/user3 — see USER_WEIGHTS below for the post-count
ratio between them) rated skip-it/it-was-okay/i-enjoyed-it/i-loved-it.

Deliberately its own script rather than a generalization of
import_bigotry_data.py — see backend/imdb-data-python/CLAUDE.md's "Adding a
new domain": imdb/standard has no severity score or neutral-flag concept, so
every post gets exactly one of the four rating categories at a fixed score
of 0 (matches the frontend — see imdb-standard.config.ts's
rating.fixedScoreValue and frontend/imdb-ui-angular/docs/design-spec.md §2
decision #7), rather than
bigotry's flag_probability/no-bigotry split.

Unlike import_resources.py, the resource-import step here is idempotent:
tconsts already present in the domain are skipped rather than aborting the
run, so this script can be re-run to layer on more mock posts without
re-seeding resources. Posts/replies are NOT idempotent — each run adds
another batch on top of whatever already exists.

Config precedence: CLI flags override standard-config.yaml, which overrides
the built-in defaults below (none — every value must come from one of the
two).
"""

import argparse
import random
import sys
from pathlib import Path

import psycopg2
import psycopg2.errors
import yaml

from import_bigotry_data import USERNAMES, create_flag, create_post, ensure_users, import_resources, split_by_weight

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG_PATH = SCRIPT_DIR / "standard-config.yaml"

REQUIRED_KEYS = (
    "tsv_path",
    "start_row",
    "end_row",
    "domain",
    "total_posts",
    "reply_fraction",
    "db_host",
    "db_port",
    "db_name",
    "db_schema",
    "db_user",
    "db_password",
)

DEFAULT_USER_WEIGHTS = (1, 2, 3)

# Worst -> best, matching V17__seed_imdb_standard_domain.sql and
# imdb-standard.config.ts's CATEGORY_BADGE_CLASS keys.
RATING_POST_TYPES = ("skip-it", "it-was-okay", "i-enjoyed-it", "i-loved-it")
FIXED_SCORE = 0

TOP_LEVEL_TEMPLATES = (
    "Finally watched {title} — my take below.",
    "{title} was exactly what I expected, for better or worse.",
    "Anyone else catch {title}? Curious what people thought.",
    "Rewatched {title} this week, opinion unchanged.",
    "{title} is going straight to my favorites list.",
    "Gave {title} a shot on a recommendation — here's my verdict.",
    "Not sure {title} lived up to the hype.",
    "{title}: quick thoughts after finishing it.",
)

REPLY_TEMPLATES = (
    "Same, {title} landed for me too.",
    "Disagree — {title} didn't do much for me.",
    "Glad someone else watched {title}, matches my take.",
    "Interesting, I had a different reaction to {title}.",
    "Adding on: {title} gets better on a second watch.",
    "Curious what specifically stood out to you about {title}?",
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Seed imdb/standard with resources, mock users, posts, and replies."
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG_PATH,
        help="Path to standard-config.yaml (default: %(default)s)",
    )
    parser.add_argument("--tsv-path", dest="tsv_path", help="Path to title.basics.tsv")
    parser.add_argument(
        "--domain",
        dest="domain",
        help="Domain name to seed into (must already exist, e.g. imdb/standard)",
    )
    parser.add_argument(
        "--start-row",
        dest="start_row",
        type=int,
        help="First title.basics.tsv data row to import as a resource, 1-indexed",
    )
    parser.add_argument("--end-row", dest="end_row", type=int, help="Last data row to import, inclusive")
    parser.add_argument(
        "--total-posts",
        dest="total_posts",
        type=int,
        help="Total number of posts+replies to generate across user1/user2/user3",
    )
    parser.add_argument(
        "--reply-fraction",
        dest="reply_fraction",
        type=float,
        help="Fraction (0-1) of total_posts that are replies to another post rather than top-level",
    )
    parser.add_argument("--seed", dest="seed", type=int, help="Random seed, for reproducible mock data")
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
    for key in REQUIRED_KEYS + ("seed",):
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
    if config["total_posts"] < 1:
        sys.exit("total_posts must be >= 1")
    if not 0 <= config["reply_fraction"] <= 1:
        sys.exit("reply_fraction must be between 0 and 1")

    user_weights = config.get("user_weights", list(DEFAULT_USER_WEIGHTS))
    if len(user_weights) != len(USERNAMES):
        sys.exit(f"user_weights must have exactly {len(USERNAMES)} entries, one per {USERNAMES}")
    config["user_weights"] = user_weights

    tsv_path = Path(config["tsv_path"])
    if not tsv_path.is_absolute():
        tsv_path = SCRIPT_DIR / tsv_path
    config["tsv_path"] = tsv_path

    return config


def load_post_types(cur, domain_id):
    cur.execute("SELECT name, id FROM post_type WHERE domain_id = %s", (domain_id,))
    post_types = dict(cur.fetchall())
    missing = [name for name in RATING_POST_TYPES if name not in post_types]
    if missing:
        sys.exit(f"Aborting: domain is missing post_type rows: {missing} (check Flyway migrations ran)")
    return post_types


def generate_posts(cur, domain_id, resources, user_ids, post_types, config, rng):
    total_posts = config["total_posts"]
    reply_count = round(total_posts * config["reply_fraction"])
    top_level_count = total_posts - reply_count

    user_counts = split_by_weight(total_posts, config["user_weights"])
    user_pool = []
    for username, count in zip(USERNAMES, user_counts):
        user_pool.extend([user_ids[username]] * count)
    rng.shuffle(user_pool)

    order = [True] * reply_count + [False] * top_level_count
    rng.shuffle(order)

    rating_tally = {name: 0 for name in RATING_POST_TYPES}
    top_level_posts = []  # (post_id, resource_id, title) — candidates for replies to attach to

    for user_id, is_reply in zip(user_pool, order):
        if is_reply and top_level_posts:
            parent_id, resource_id, title = rng.choice(top_level_posts)
            body_text = rng.choice(REPLY_TEMPLATES).format(title=title)
        else:
            resource_id, title = resources[rng.randrange(len(resources))]
            body_text = rng.choice(TOP_LEVEL_TEMPLATES).format(title=title)
            parent_id = None

        post_id = create_post(cur, resource_id, user_id, domain_id, body_text, parent_id)

        rating_name = rng.choice(RATING_POST_TYPES)
        create_flag(cur, post_id, post_types[rating_name], FIXED_SCORE, domain_id)
        rating_tally[rating_name] += 1

        if parent_id is None:
            top_level_posts.append((post_id, resource_id, title))

    return dict(zip(USERNAMES, user_counts)), reply_count, top_level_count, rating_tally


def main():
    args = parse_args()
    config = load_config(args)
    rng = random.Random(config.get("seed"))

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
                    sys.exit(f"Aborting: domain '{config['domain']}' not found — nothing was seeded.")
                domain_id = row[0]

                cur.execute("SELECT name, id FROM resource_category WHERE domain_id = %s", (domain_id,))
                category_ids = dict(cur.fetchall())

                resources, inserted_count, skipped_count = import_resources(
                    cur, domain_id, category_ids, config["tsv_path"], config["start_row"], config["end_row"]
                )

                user_ids = ensure_users(cur, domain_id)
                post_types = load_post_types(cur, domain_id)

                user_counts, reply_count, top_level_count, rating_tally = generate_posts(
                    cur, domain_id, resources, user_ids, post_types, config, rng
                )
    except psycopg2.errors.UniqueViolation as e:
        sys.exit(f"Aborting: unique constraint violation — nothing was committed.\n{e.pgerror}")
    finally:
        conn.close()

    print(
        f"Resources: {inserted_count} inserted, {skipped_count} already present "
        f"(rows {config['start_row']}-{config['end_row']})."
    )
    print(f"Users: {', '.join(f'{u}={c}' for u, c in user_counts.items())}")
    print(f"Posts: {top_level_count} top-level, {reply_count} replies.")
    print(f"Ratings: {', '.join(f'{name}={count}' for name, count in rating_tally.items())}")


if __name__ == "__main__":
    main()
