#!/usr/bin/env bash
# Stops the stack. By default the database volume is kept (so the next
# `./scripts/docker-run.sh` comes back up with the same data) — pass --all
# to wipe it too.
#
# Usage:
#   ./scripts/docker-shutdown.sh          # stop containers, keep the db volume
#   ./scripts/docker-shutdown.sh --all    # stop containers, wipe the db volume

if [ -n "${ZSH_VERSION:-}" ] || { [ -n "${BASH_VERSION:-}" ] && [ "${BASH_SOURCE[0]}" != "${0}" ]; }; then
  echo "Run this directly — ./scripts/docker-shutdown.sh — don't source it with '.' or 'source'." >&2
  echo "Sourcing runs it in your current shell instead of a fresh bash process, which breaks here" >&2
  echo "and can terminate your interactive shell entirely instead of just this script." >&2
  return 1 2>/dev/null || exit 1
fi

set -uo pipefail

# This script lives in scripts/, but docker-compose.yml is at the repo root —
# run everything from there, not from scripts/ itself.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

WIPE_VOLUMES=false

for arg in "$@"; do
  case "$arg" in
    --all)
      WIPE_VOLUMES=true
      ;;
    -h|--help)
      echo "Usage: $(basename "$0") [--all]"
      echo "  (no args)  Stop containers, keep the database volume."
      echo "  --all      Stop containers and delete the database volume too."
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $(basename "$0") [--all]" >&2
      exit 1
      ;;
  esac
done

if [ "$WIPE_VOLUMES" = true ]; then
  echo "Stopping everything, including the database volume..."
  exec docker compose down -v
else
  echo "Stopping containers (database volume kept — pass --all to wipe it too)..."
  exec docker compose down
fi
