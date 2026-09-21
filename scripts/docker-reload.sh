#!/usr/bin/env bash
# Rebuilds and redeploys frontend and/or posts in a stack that's already
# running — the fast "I changed some code, get it live" loop. Unlike
# ./scripts/docker-run.sh, this skips docker-precheck.sh's port-free checks
# (which fail here since the running stack's own containers already hold
# those ports) and only touches the service(s) you ask for, leaving
# everything else (including postgres data) untouched.
#
# Usage:
#   ./scripts/docker-reload.sh                    # rebuild + redeploy both (default)
#   ./scripts/docker-reload.sh frontend           # frontend only
#   ./scripts/docker-reload.sh backend            # posts only
#   ./scripts/docker-reload.sh frontend backend   # same as default, explicit

if [ -n "${ZSH_VERSION:-}" ] || { [ -n "${BASH_VERSION:-}" ] && [ "${BASH_SOURCE[0]}" != "${0}" ]; }; then
  echo "Run this directly — ./scripts/docker-reload.sh — don't source it with '.' or 'source'." >&2
  echo "Sourcing runs it in your current shell instead of a fresh bash process, which breaks here" >&2
  echo "and can terminate your interactive shell entirely instead of just this script." >&2
  return 1 2>/dev/null || exit 1
fi

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

if ! command -v docker >/dev/null 2>&1; then
  echo "docker CLI not found — install Docker Desktop: https://www.docker.com/products/docker-desktop/" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon isn't reachable — start Docker Desktop (or your Docker service) and try again." >&2
  exit 1
fi

SERVICES=()
RELOAD_BACKEND=false
for arg in "$@"; do
  case "$arg" in
    frontend)
      SERVICES+=("frontend")
      ;;
    backend)
      SERVICES+=("posts")
      RELOAD_BACKEND=true
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $(basename "$0") [frontend] [backend]" >&2
      exit 1
      ;;
  esac
done

if [ "${#SERVICES[@]}" -eq 0 ]; then
  SERVICES=(frontend posts)
  RELOAD_BACKEND=true
fi

echo "Rebuilding: ${SERVICES[*]}..."
if ! docker compose build "${SERVICES[@]}"; then
  echo
  echo "Build failed — see the error above."
  exit 1
fi

echo
echo "Redeploying: ${SERVICES[*]}..."
if ! docker compose up -d "${SERVICES[@]}"; then
  echo
  echo "Failed to redeploy — see the error above."
  exit 1
fi

if [ "$RELOAD_BACKEND" = true ]; then
  echo
  echo "Waiting for posts to finish restarting (Flyway migrations re-run on boot)..."
  if ! "$SCRIPT_DIR/docker-wait-for-posts.sh"; then
    exit 1
  fi
fi

echo
echo "Done. Updated: ${SERVICES[*]}"
echo "  Frontend: http://localhost:${FRONTEND_PORT}"
echo "  API:      http://localhost:${API_PORT}/swagger-ui.html"
