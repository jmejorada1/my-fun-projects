#!/usr/bin/env bash
# Blocks until posts' Flyway migrations have applied, or exits 1 on a 2-
# minute timeout / if the posts container exits unexpectedly. Checked
# directly against the database (posts.flyway_schema_history) rather than
# by parsing app logs — log-grepping proved unreliable across runs.
#
# Shared by docker-run.sh (bigotry-data mode) and docker-load-bigotry-data.sh.
# Assumes postgres + posts are already starting via `docker compose up -d`.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

for _ in $(seq 1 60); do
  if docker compose exec -T postgres psql -U postgres -d posts-db -c \
    "SELECT 1 FROM posts.flyway_schema_history LIMIT 1" >/dev/null 2>&1; then
    exit 0
  fi
  STATUS="$(docker compose ps -q posts | xargs -r docker inspect -f '{{.State.Status}}' 2>/dev/null)"
  if [ "$STATUS" = "exited" ]; then
    echo "posts container exited unexpectedly — check 'docker compose logs posts'." >&2
    exit 1
  fi
  sleep 2
done

echo "Migrations didn't finish within 2 minutes — check 'docker compose logs posts'." >&2
exit 1
