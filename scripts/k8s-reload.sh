#!/usr/bin/env bash
# Rebuilds frontend and/or posts and rolls them in the running k8s stack —
# the k8s version of ./scripts/docker-reload.sh. No precheck. The rebuilt
# :local image replaces the old one in the image store the cluster shares, and
# `rollout restart` starts new pods from it. Postgres data is untouched.
#
# Usage:
#   ./scripts/k8s-reload.sh                    # both (default)
#   ./scripts/k8s-reload.sh frontend           # frontend only
#   ./scripts/k8s-reload.sh backend            # posts only

if [ -n "${ZSH_VERSION:-}" ] || { [ -n "${BASH_VERSION:-}" ] && [ "${BASH_SOURCE[0]}" != "${0}" ]; }; then
  echo "Run this directly — ./scripts/k8s-reload.sh — don't source it with '.' or 'source'." >&2
  echo "Sourcing runs it in your current shell instead of a fresh bash process, which breaks here" >&2
  echo "and can terminate your interactive shell entirely instead of just this script." >&2
  return 1 2>/dev/null || exit 1
fi

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib-k8s.sh"

TARGETS=()
for arg in "$@"; do
  case "$arg" in
    frontend|backend) TARGETS+=("$arg") ;;
    -h|--help) print_header_help "$0"; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; echo "Usage: $(basename "$0") [frontend] [backend]" >&2; exit 1 ;;
  esac
done
[ "${#TARGETS[@]}" -eq 0 ] && TARGETS=(frontend backend)

docker info >/dev/null 2>&1 || die "Docker daemon isn't reachable. Start Docker Desktop and try again."
kc get deployment -n "$K8S_NAMESPACE" posts frontend >/dev/null 2>&1 \
  || die "The k8s stack isn't deployed on $K8S_CONTEXT. Start it with ./scripts/k8s-run.sh"

for target in "${TARGETS[@]}"; do
  if [ "$target" = frontend ]; then
    image=imdb/frontend:local; deployment=frontend
  else
    image=imdb/posts:local; deployment=posts
  fi
  build_images "$image"
  kc rollout restart -n "$K8S_NAMESPACE" "deployment/$deployment" || die "rollout restart of $deployment failed."
done

for target in "${TARGETS[@]}"; do
  deployment=$([ "$target" = frontend ] && echo frontend || echo posts)
  echo "Waiting for $deployment to roll out (posts re-runs Flyway on boot)..."
  kc rollout status -n "$K8S_NAMESPACE" "deployment/$deployment" --timeout=5m \
    || die "$deployment didn't become ready. Check: kubectl --context $K8S_CONTEXT get pods -n $K8S_NAMESPACE"
done

echo
echo "Done. Updated: ${TARGETS[*]}"
echo "  Frontend: http://localhost:${FRONTEND_PORT}"
echo "  API:      http://localhost:${FRONTEND_PORT}/api/swagger-ui.html"
