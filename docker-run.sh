#!/usr/bin/env bash
# Runs docker-precheck.sh, then builds and starts the stack if it passes.
# Build and up are run as separate commands rather than `up --build`
# since that flag isn't available on every Compose release (notably the
# one bundled with older Docker Desktop installs) — `build` is a fast
# no-op via layer caching when nothing changed, so this costs nothing on
# repeat runs. Any arguments are forwarded to `up`, e.g.:
#   ./docker-run.sh -d              # detached
#   ./docker-run.sh posts frontend  # only start these services

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

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

echo
echo "Build complete — starting docker compose..."
echo

exec docker compose up "$@"
