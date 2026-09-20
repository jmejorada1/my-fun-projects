#!/usr/bin/env bash
# Stops the stack. By default the database volume is kept (so the next
# `./docker-run.sh` comes back up with the same data) — pass --all to
# wipe it too.
#
# Usage:
#   ./docker-shutdown.sh          # stop containers, keep the db volume
#   ./docker-shutdown.sh --all    # stop containers, wipe the db volume

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

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
