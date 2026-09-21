#!/usr/bin/env python3
"""Seed the imdb/bigotry domain with resources plus mock users, posts, replies,
and post_flag rows, for local/dev testing of the bigotry-flagging UI.

Reuses import_resources.py's TSV parsing for the resource-import step (same
title.basics.tsv row range), then layers on synthetic posts/replies authored
by three mock users (user1/user2/user3 — see USER_WEIGHTS below for the
post-count ratio between them) and flags a portion of them with post_type
rows (racism/sexism/lgbtq-phobic/no-bigotry).

Unlike import_resources.py, the resource-import step here is idempotent:
tconsts already present in the domain are skipped rather than aborting the
run, so this script can be re-run to layer on more mock posts without
re-seeding resources. Posts/replies/flags are NOT idempotent — each run adds
another batch on top of whatever already exists.

Config precedence: CLI flags override bigotry-config.yaml, which overrides
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
from psycopg2.extras import Json, execute_values

from import_resources import read_rows

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG_PATH = SCRIPT_DIR / "bigotry-config.yaml"

REQUIRED_KEYS = (
    "tsv_path",
    "start_row",
    "end_row",
    "domain",
    "total_posts",
    "reply_fraction",
    "flag_probability",
    "db_host",
    "db_port",
    "db_name",
    "db_schema",
    "db_user",
    "db_password",
)

# user1 posts least, user3 posts most — ratio applied to total_posts via
# split_by_weight(). Override the counts by editing user_weights in config.
USERNAMES = ("user1", "user2", "user3")
DEFAULT_USER_WEIGHTS = (1, 2, 3)

FLAG_POST_TYPES = ("racism", "sexism", "lgbtq-phobic")
NEUTRAL_POST_TYPE = "no-bigotry"

TOP_LEVEL_TEMPLATES = (
    "What did everyone think of {title}?",
    "Just watched {title} for the first time, mixed feelings.",
    "{title} is one of my all-time favorites.",
    "Rewatched {title} last night, still holds up.",
    "Anyone else notice how {title} handles its subject matter?",
    "Not sure {title} deserves the reputation it has.",
    "{title} was recommended to me — worth the watch?",
    "Hot take: {title} is overrated.",
)

REPLY_TEMPLATES = (
    "Agreed, {title} really is something else.",
    "I disagree, I think {title} gets too much credit.",
    "Same here, {title} surprised me.",
    "That's a fair point about {title}.",
    "Adding to this: {title} has some issues worth discussing.",
    "Not sure I follow — can you say more about {title}?",
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Seed imdb/bigotry with resources, mock users, posts, replies, and flags."
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG_PATH,
        help="Path to bigotry-config.yaml (default: %(default)s)",
    )
    parser.add_argument("--tsv-path", dest="tsv_path", help="Path to title.basics.tsv")
    parser.add_argument(
        "--domain",
        dest="domain",
        help="Domain name to seed into (must already exist, e.g. imdb/bigotry)",
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
    parser.add_argument(
        "--flag-probability",
        dest="flag_probability",
        type=float,
        help="Fraction (0-1) of posts/replies flagged racism/sexism/lgbtq-phobic instead of no-bigotry",
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
    if not 0 <= config["flag_probability"] <= 1:
        sys.exit("flag_probability must be between 0 and 1")

    user_weights = config.get("user_weights", list(DEFAULT_USER_WEIGHTS))
    if len(user_weights) != len(USERNAMES):
        sys.exit(f"user_weights must have exactly {len(USERNAMES)} entries, one per {USERNAMES}")
    config["user_weights"] = user_weights

    tsv_path = Path(config["tsv_path"])
    if not tsv_path.is_absolute():
        tsv_path = SCRIPT_DIR / tsv_path
    config["tsv_path"] = tsv_path

    return config


def split_by_weight(total, weights):
    """Largest-remainder apportionment of `total` items across `weights`."""
    weight_sum = sum(weights)
    raw = [total * w / weight_sum for w in weights]
    counts = [int(x) for x in raw]
    remainder = total - sum(counts)
    order = sorted(range(len(weights)), key=lambda i: raw[i] - counts[i], reverse=True)
    for i in order[:remainder]:
        counts[i] += 1
    return counts


def import_resources(cur, domain_id, category_ids, tsv_path, start_row, end_row):
    """Insert any not-yet-present resources for the given row range, and
    return (resource_id, display_name) for every resource in that range
    (pre-existing or newly inserted), plus how many of each."""
    cur.execute("SELECT name, id FROM resource WHERE domain_id = %s", (domain_id,))
    existing_ids = dict(cur.fetchall())

    rows = list(read_rows(tsv_path, start_row, end_row))
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

    to_insert = [
        (tconst, primary_title, category_ids[title_type], domain_id, Json(data))
        for _, (tconst, title_type, primary_title, data) in rows
        if tconst not in existing_ids
    ]

    inserted_ids = {}
    if to_insert:
        result = execute_values(
            cur,
            "INSERT INTO resource (name, display_name, category_id, domain_id, data) "
            "VALUES %s RETURNING id, name",
            to_insert,
            fetch=True,
        )
        inserted_ids = {name: resource_id for resource_id, name in result}

    resources = []
    for _, (tconst, _title_type, primary_title, _data) in rows:
        resource_id = existing_ids.get(tconst, inserted_ids.get(tconst))
        resources.append((resource_id, primary_title))

    return resources, len(inserted_ids), len(rows) - len(inserted_ids)


def ensure_users(cur, domain_id):
    values = [(username, f"{username}@example.com", domain_id) for username in USERNAMES]
    execute_values(
        cur,
        "INSERT INTO app_user (username, email, domain_id) VALUES %s "
        "ON CONFLICT (domain_id, username) DO NOTHING",
        values,
    )
    cur.execute(
        "SELECT username, id FROM app_user WHERE domain_id = %s AND username = ANY(%s)",
        (domain_id, list(USERNAMES)),
    )
    return dict(cur.fetchall())


def load_post_types(cur, domain_id):
    cur.execute("SELECT name, id FROM post_type WHERE domain_id = %s", (domain_id,))
    post_types = dict(cur.fetchall())
    missing = [name for name in (*FLAG_POST_TYPES, NEUTRAL_POST_TYPE) if name not in post_types]
    if missing:
        sys.exit(f"Aborting: domain is missing post_type rows: {missing} (check Flyway migrations ran)")
    return post_types


def choose_flag(post_types, flag_probability, rng):
    if rng.random() < flag_probability:
        name = rng.choice(FLAG_POST_TYPES)
        score = rng.randint(1, 5)
    else:
        name = NEUTRAL_POST_TYPE
        score = 0
    return post_types[name], score, name


def create_post(cur, resource_id, user_id, domain_id, body_text, parent_post_id=None):
    cur.execute(
        "INSERT INTO post (resource_id, user_id, parent_post_id, body_text, domain_id) "
        "VALUES (%s, %s, %s, %s, %s) RETURNING id",
        (resource_id, user_id, parent_post_id, body_text, domain_id),
    )
    return cur.fetchone()[0]


def create_flag(cur, post_id, post_type_id, score, domain_id):
    cur.execute(
        "INSERT INTO post_flag (post_id, post_type_id, score, domain_id) VALUES (%s, %s, %s, %s)",
        (post_id, post_type_id, score, domain_id),
    )


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

    flag_tally = {name: 0 for name in (*FLAG_POST_TYPES, NEUTRAL_POST_TYPE)}
    top_level_posts = []  # (post_id, resource_id, title) — candidates for replies to parent to

    for user_id, is_reply in zip(user_pool, order):
        if is_reply and top_level_posts:
            parent_id, resource_id, title = rng.choice(top_level_posts)
            body_text = rng.choice(REPLY_TEMPLATES).format(title=title)
        else:
            resource_id, title = resources[rng.randrange(len(resources))]
            body_text = rng.choice(TOP_LEVEL_TEMPLATES).format(title=title)
            parent_id = None

        post_id = create_post(cur, resource_id, user_id, domain_id, body_text, parent_id)

        post_type_id, score, flag_name = choose_flag(post_types, config["flag_probability"], rng)
        create_flag(cur, post_id, post_type_id, score, domain_id)
        flag_tally[flag_name] += 1

        if parent_id is None:
            top_level_posts.append((post_id, resource_id, title))

    return dict(zip(USERNAMES, user_counts)), reply_count, top_level_count, flag_tally


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

                user_counts, reply_count, top_level_count, flag_tally = generate_posts(
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
    print(f"Flags: {', '.join(f'{name}={count}' for name, count in flag_tally.items())}")


if __name__ == "__main__":
    main()
