#!/usr/bin/env bash
# Runs docker-precheck.sh, then builds and starts the stack if it passes.
# Build and up are run as separate commands rather than `up --build`
# since that flag isn't available on every Compose release (notably the
# one bundled with older Docker Desktop installs) — `build` is a fast
# no-op via layer caching when nothing changed, so this costs nothing on
# repeat runs. Any arguments are forwarded to `up`, e.g.:
#   ./scripts/docker-run.sh -d              # detached
#   ./scripts/docker-run.sh posts frontend  # only start these services
#
# Three arguments are NOT forwarded to `up` — pull any of these out of the
# argument list, anywhere, to also seed mock data after startup:
#   bigotry-data   seed mock imdb/bigotry data (resources +
#                  user1/user2/user3 posts/replies/flags)
#   standard-data  seed mock imdb/standard data (resources +
#                  a small amount of user1/user2/user3 posts/replies)
#   --all          shorthand for both bigotry-data and standard-data
# Either, both, or --all, e.g.:
#   ./scripts/docker-run.sh bigotry-data                 # just bigotry
#   ./scripts/docker-run.sh standard-data                # just standard
#   ./scripts/docker-run.sh bigotry-data standard-data   # both
#   ./scripts/docker-run.sh --all                        # both, shorthand
# Passing any of these forces the stack up detached (regardless of other
# args) so the seeding job(s) can run against it, then leaves it running in
# the background — use ./scripts/docker-shutdown.sh to stop it, same as any
# other detached run.

set -uo pipefail

# This script lives in scripts/, but docker-compose.yml and every relative
# build context (./backend/posts, etc.) it points at are at the repo root —
# run everything from there, not from scripts/ itself.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# Same .env docker-compose.yml itself reads for port interpolation (see
# .env.example) — read here too so the URLs printed below match whatever
# ports the stack actually came up on.
[ -f .env ] && set -o allexport && source .env && set +o allexport
FRONTEND_PORT="${FRONTEND_PORT:-4200}"
API_PORT="${API_PORT:-8080}"

LOAD_BIGOTRY_DATA=false
LOAD_STANDARD_DATA=false
UP_ARGS=()
for arg in "$@"; do
  if [ "$arg" = "bigotry-data" ]; then
    LOAD_BIGOTRY_DATA=true
  elif [ "$arg" = "standard-data" ]; then
    LOAD_STANDARD_DATA=true
  elif [ "$arg" = "--all" ]; then
    LOAD_BIGOTRY_DATA=true
    LOAD_STANDARD_DATA=true
  else
    UP_ARGS+=("$arg")
  fi
done

if ! "$SCRIPT_DIR/docker-precheck.sh"; then
  echo
  echo "Precheck failed — not starting docker compose. Fix the item(s) above and try again."
  exit 1
fi

echo
echo "Precheck passed — building images..."
echo

if ! docker compose build; then
  echo
  echo "Build failed — see the error above."
  exit 1
fi

if [ "$LOAD_BIGOTRY_DATA" = false ] && [ "$LOAD_STANDARD_DATA" = false ]; then
  echo
  echo "Build complete — starting docker compose..."
  echo

  exec docker compose up "${UP_ARGS[@]+"${UP_ARGS[@]}"}"
fi

echo
echo "Build complete — starting docker compose (detached, so mock data can be seeded)..."
echo

if ! docker compose up -d "${UP_ARGS[@]+"${UP_ARGS[@]}"}"; then
  echo
  echo "Failed to start docker compose — see the error above."
  exit 1
fi

echo
echo "Waiting for posts' Flyway migrations to apply (up to 2 min)..."
if ! "$SCRIPT_DIR/docker-wait-for-posts.sh"; then
  exit 1
fi

if [ "$LOAD_BIGOTRY_DATA" = true ]; then
  echo
  echo "Seeding mock bigotry data..."
  if ! docker compose run --rm bigotry-loader; then
    echo
    echo "bigotry-loader failed — see the error above. The stack is still running."
    exit 1
  fi
fi

if [ "$LOAD_STANDARD_DATA" = true ]; then
  echo
  echo "Seeding mock standard data..."
  if ! docker compose run --rm standard-loader; then
    echo
    echo "standard-loader failed — see the error above. The stack is still running."
    exit 1
  fi
fi

echo
echo "Stack is running (detached) with mock data loaded."
echo "  Frontend: http://localhost:${FRONTEND_PORT}"
echo "  API:      http://localhost:${API_PORT}/swagger-ui.html"
echo "  Logs:     docker compose logs -f"
echo "  Stop:     ./scripts/docker-shutdown.sh"
