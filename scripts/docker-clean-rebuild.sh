#!/usr/bin/env bash
# Full from-scratch reset: runs docker-hard-clean.sh to tear down the
# stack (containers, networks, the database volume, every image this
# project built or pulled — irreversible), rebuilds everything with
# --no-cache so no cached layers (npm install, mvn dependency resolution,
# etc.) survive, then hands off to docker-run.sh to bring the stack back
# up. Prompts for confirmation before the teardown; pass -y/--yes to skip
# it. Every other argument is forwarded to docker-run.sh untouched, e.g.:
#   ./scripts/docker-clean-rebuild.sh              # rebuild, foreground
#   ./scripts/docker-clean-rebuild.sh -y -d        # skip prompt, rebuild detached
#   ./scripts/docker-clean-rebuild.sh --all        # rebuild + seed both domains' mock data
#
# This does NOT touch Docker's global build cache (`docker builder prune`)
# — that's shared across every project on the machine, not just this one.
# Run that yourself first if you also want it cleared:
#   docker builder prune -f

if [ -n "${ZSH_VERSION:-}" ] || { [ -n "${BASH_VERSION:-}" ] && [ "${BASH_SOURCE[0]}" != "${0}" ]; }; then
  echo "Run this directly — ./scripts/docker-clean-rebuild.sh — don't source it with '.' or 'source'." >&2
  echo "Sourcing runs it in your current shell instead of a fresh bash process, which breaks here" >&2
  echo "and would apply this script's 'set -u'/'pipefail' to your interactive session." >&2
  return 1 2>/dev/null || exit 1
fi

set -uo pipefail

START_TIME=$(date +%s)
print_elapsed() {
  local elapsed=$(( $(date +%s) - START_TIME ))
  printf '\nTotal time: %dm %02ds\n' "$((elapsed / 60))" "$((elapsed % 60))"
}
trap print_elapsed EXIT

# This script lives in scripts/, but docker-compose.yml and every relative
# build context (./backend/posts, etc.) it points at are at the repo root —
# run everything from there, not from scripts/ itself.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

SKIP_CONFIRM=false
FORWARD_ARGS=()
for arg in "$@"; do
  case "$arg" in
    -y|--yes)
      SKIP_CONFIRM=true
      ;;
    *)
      FORWARD_ARGS+=("$arg")
      ;;
  esac
done

if [ "$SKIP_CONFIRM" = false ]; then
  echo "This will permanently delete the database volume and every image"
  echo "this project built or pulled, then rebuild everything from scratch"
  echo "and restart the stack."
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

if ! "$SCRIPT_DIR/docker-hard-clean.sh" -y; then
  echo
  echo "Teardown failed — see the error above."
  exit 1
fi

echo
echo "Rebuilding every image with no cache..."
if ! docker compose build --no-cache; then
  echo
  echo "Build failed — see the error above."
  exit 1
fi

echo
echo "Clean rebuild complete — starting the stack via docker-run.sh..."
echo
"$SCRIPT_DIR/docker-run.sh" "${FORWARD_ARGS[@]+"${FORWARD_ARGS[@]}"}"
