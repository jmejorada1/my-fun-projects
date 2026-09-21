#!/usr/bin/env bash
# Seeds the imdb/bigotry domain with mock resources plus user1/user2/user3
# posts, replies, and flags via the bigotry-loader one-off job — runs
# standalone, without needing ./docker-run.sh already up first.
#
# Self-contained: the loader reads from the sample dataset baked into the
# image (backend/imdb-data-python/sample-data/), so no IMDB download is
# needed. To seed from the real, full title.basics.tsv instead, see the
# bigotry-loader comment in docker-compose.yml for the ad hoc bind-mount
# command (this script doesn't support that — run docker compose directly).
#
# Starts (or reuses) postgres + posts just long enough for posts' Flyway
# migrations to apply (frontend is not started), then runs bigotry-loader.
# Containers are left running afterward — use ./docker-shutdown.sh when
# you're done. Any arguments are forwarded to import_bigotry_data.py, e.g.:
#   ./docker-load-bigotry-data.sh --total-posts 1000 --seed 42
#   ./docker-load-bigotry-data.sh --start-row 1 --end-row 500

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker CLI not found — install Docker Desktop: https://www.docker.com/products/docker-desktop/" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon isn't reachable — start Docker Desktop (or your Docker service) and try again." >&2
  exit 1
fi

echo "Building images..."
if ! docker compose build posts bigotry-loader; then
  echo "Build failed — see the error above." >&2
  exit 1
fi

echo
echo "Starting postgres + posts (for Flyway migrations; frontend is not needed here)..."
if ! docker compose up -d postgres posts; then
  echo "Failed to start postgres/posts — see the error above." >&2
  exit 1
fi

echo
echo "Waiting for posts' Flyway migrations to apply (up to 2 min)..."
if ! "$SCRIPT_DIR/docker-wait-for-posts.sh"; then
  exit 1
fi

echo
echo "Running bigotry-loader..."
exec docker compose run --rm bigotry-loader "$@"
