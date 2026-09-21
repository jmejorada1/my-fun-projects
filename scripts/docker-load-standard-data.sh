#!/usr/bin/env bash
# Seeds the imdb/standard domain with mock resources plus a small amount of
# user1/user2/user3 posts and replies via the standard-loader one-off job —
# runs standalone, without needing ./scripts/docker-run.sh already up first.
#
# Self-contained: the loader reads from the sample dataset baked into the
# image (backend/imdb-data-python/sample-data/), so no IMDB download is
# needed. To seed from the real, full title.basics.tsv instead, see the
# standard-loader comment in docker-compose.yml for the ad hoc bind-mount
# command (this script doesn't support that — run docker compose directly).
#
# Starts (or reuses) postgres + posts just long enough for posts' Flyway
# migrations to apply (frontend is not started), then runs standard-loader.
# Containers are left running afterward — use ./scripts/docker-shutdown.sh
# when you're done. Any arguments are forwarded to import_standard_data.py,
# e.g.:
#   ./scripts/docker-load-standard-data.sh --total-posts 200 --seed 42
#   ./scripts/docker-load-standard-data.sh --start-row 1 --end-row 1000

if [ -n "${ZSH_VERSION:-}" ] || { [ -n "${BASH_VERSION:-}" ] && [ "${BASH_SOURCE[0]}" != "${0}" ]; }; then
  echo "Run this directly — ./scripts/docker-load-standard-data.sh — don't source it with '.' or 'source'." >&2
  echo "Sourcing runs it in your current shell instead of a fresh bash process, which breaks here" >&2
  echo "and can terminate your interactive shell entirely instead of just this script." >&2
  return 1 2>/dev/null || exit 1
fi

set -uo pipefail

# This script lives in scripts/, but docker-compose.yml and every relative
# build context (./backend/imdb-data-python, etc.) it points at are at the
# repo root — run everything from there, not from scripts/ itself.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker CLI not found — install Docker Desktop: https://www.docker.com/products/docker-desktop/" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon isn't reachable — start Docker Desktop (or your Docker service) and try again." >&2
  exit 1
fi

echo "Building images..."
if ! docker compose build posts standard-loader; then
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
echo "Running standard-loader..."
exec docker compose run --rm standard-loader "$@"
