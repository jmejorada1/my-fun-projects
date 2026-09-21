#!/usr/bin/env bash
# Tears down the stack completely: containers, networks, the database
# volume, and every image this project built or pulled (e.g.
# postgres:16-alpine). Teardown only — it does not rebuild or start
# anything back up. Irreversible: any data only in the database volume
# (not re-seedable from a loader) is gone once this runs.
#
# Usage:
#   ./scripts/docker-hard-clean.sh          # prompts for confirmation
#   ./scripts/docker-hard-clean.sh -y       # skip the prompt
#
# Use ./scripts/docker-clean-rebuild.sh instead for the full
# tear-down-then-rebuild-then-start flow (it calls this script for the
# teardown step, passing -y since it already confirmed itself). After
# running this on its own, bring the stack back up with
# ./scripts/docker-run.sh whenever you're ready.

if [ -n "${ZSH_VERSION:-}" ] || { [ -n "${BASH_VERSION:-}" ] && [ "${BASH_SOURCE[0]}" != "${0}" ]; }; then
  echo "Run this directly — ./scripts/docker-hard-clean.sh — don't source it with '.' or 'source'." >&2
  echo "Sourcing runs it in your current shell instead of a fresh bash process, which breaks here" >&2
  echo "and would apply this script's 'set -u'/'pipefail' to your interactive session." >&2
  return 1 2>/dev/null || exit 1
fi

set -uo pipefail

SKIP_CONFIRM=false
for arg in "$@"; do
  case "$arg" in
    -y|--yes)
      SKIP_CONFIRM=true
      ;;
    -h|--help)
      echo "Usage: $(basename "$0") [-y|--yes]"
      echo "  Tears down containers, networks, the database volume, and every"
      echo "  image this project built or pulled. Irreversible."
      echo "  -y, --yes  Skip the confirmation prompt."
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $(basename "$0") [-y|--yes]" >&2
      exit 1
      ;;
  esac
done

if [ "$SKIP_CONFIRM" = false ]; then
  echo "This will permanently delete:"
  echo "  - the database volume (every post/reply/flag/user you've loaded)"
  echo "  - every image this project built or pulled"
  echo
  if [ -t 0 ]; then
    read -r -p "Continue? [y/N] " REPLY
    case "$REPLY" in
      [yY]|[yY][eE][sS]) ;;
      *)
        echo "Aborted — nothing was touched."
        exit 1
        ;;
    esac
  else
    echo "Not running in an interactive terminal — pass -y/--yes to confirm non-interactively." >&2
    exit 1
  fi
fi

# This script lives in scripts/, but docker-compose.yml is at the repo
# root — run everything from there, not from scripts/ itself.
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

echo "Tearing down the stack: containers, networks, the database volume,"
echo "and every image it built or pulled..."
docker compose down -v --rmi all --remove-orphans

echo
echo "Done — stack fully torn down. Bring it back up with:"
echo "  ./scripts/docker-run.sh"
