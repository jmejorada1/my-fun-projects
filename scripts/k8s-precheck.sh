#!/usr/bin/env bash
# Sanity-checks this machine before ./scripts/k8s-run.sh: kubectl present,
# Docker up, Docker Desktop's Kubernetes reachable, the compose stack NOT
# running (only one stack at a time), and FRONTEND_PORT free if the imdb
# Gateway isn't deployed yet. Exits 0 if the k8s stack should be able to
# start, non-zero otherwise.
#
# Usage:
#   ./scripts/k8s-precheck.sh                 # the checks above
#   ./scripts/k8s-precheck.sh --image-probe   # also prove the cluster can run a
#                                             # locally built image with no pull
#                                             # (builds imdb/posts:local if missing)

if [ -n "${ZSH_VERSION:-}" ] || { [ -n "${BASH_VERSION:-}" ] && [ "${BASH_SOURCE[0]}" != "${0}" ]; }; then
  echo "Run this directly — ./scripts/k8s-precheck.sh — don't source it with '.' or 'source'." >&2
  echo "Sourcing runs it in your current shell instead of a fresh bash process, which breaks here" >&2
  echo "and can terminate your interactive shell entirely instead of just this script." >&2
  return 1 2>/dev/null || exit 1
fi

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib-k8s.sh"

IMAGE_PROBE=false
for arg in "$@"; do
  case "$arg" in
    --image-probe) IMAGE_PROBE=true ;;
    -h|--help) print_header_help "$0"; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; echo "Usage: $(basename "$0") [--image-probe]" >&2; exit 1 ;;
  esac
done

FAIL_COUNT=0

pass() { printf '  \033[32m\xe2\x9c\x93\033[0m %s\n' "$1"; }
fail() {
  printf '  \033[31m\xe2\x9c\x97\033[0m %s\n' "$1"
  [ -n "${2:-}" ] && printf '      %s\n' "$2"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}
warn() {
  printf '  \033[33m!\033[0m %s\n' "$1"
  [ -n "${2:-}" ] && printf '      %s\n' "$2"
}

echo "Checking this repo's local Kubernetes setup (context: $K8S_CONTEXT)..."
echo

# 1. kubectl installed.
HAVE_KUBECTL=false
if command -v kubectl >/dev/null 2>&1; then
  pass "kubectl found"
  HAVE_KUBECTL=true
else
  fail "kubectl not found" "Docker Desktop ships it; or install it: https://kubernetes.io/docs/tasks/tools/"
fi

# 2. Docker daemon up.
DOCKER_UP=false
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  pass "Docker daemon is running"
  DOCKER_UP=true
else
  fail "Docker daemon isn't reachable" "Start Docker Desktop, then re-run this script."
fi

# 3. docker-desktop context exists and the cluster answers.
CLUSTER_UP=false
if [ "$HAVE_KUBECTL" = true ]; then
  if ! kubectl config get-contexts -o name 2>/dev/null | grep -qx "$K8S_CONTEXT"; then
    fail "kubectl context '$K8S_CONTEXT' not found" \
      "Enable Kubernetes in Docker Desktop → Settings → Kubernetes."
  elif kc get nodes --request-timeout=10s >/dev/null 2>&1; then
    pass "Kubernetes cluster '$K8S_CONTEXT' is reachable"
    CLUSTER_UP=true
  else
    fail "Kubernetes cluster '$K8S_CONTEXT' isn't reachable" \
      "Enable Kubernetes in Docker Desktop → Settings → Kubernetes, and wait until it shows as running."
  fi
fi

# 4. The compose stack must not be running (both stacks claim FRONTEND_PORT).
if [ "$DOCKER_UP" = true ]; then
  if [ -n "$(docker compose ps -q 2>/dev/null)" ]; then
    fail "the docker compose stack is running" "Only one stack at a time: run ./scripts/docker-shutdown.sh first."
  else
    pass "docker compose stack is not running"
  fi
fi

# 5. FRONTEND_PORT free, unless our own Gateway already holds it.
if ! (require_numeric_port FRONTEND_PORT "$FRONTEND_PORT") 2>/dev/null; then
  fail "invalid FRONTEND_PORT value: '$FRONTEND_PORT'" "Must be a plain number (1-65535). Check .env."
elif [ "$CLUSTER_UP" = true ] && kc get gateway imdb -n "$K8S_NAMESPACE" >/dev/null 2>&1; then
  pass "imdb Gateway already deployed (it owns port $FRONTEND_PORT)"
elif command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP:"$FRONTEND_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "port $FRONTEND_PORT is already in use" \
      "Find what's using it: lsof -nP -iTCP:$FRONTEND_PORT -sTCP:LISTEN"
  else
    pass "port $FRONTEND_PORT is free"
  fi
else
  warn "couldn't check port $FRONTEND_PORT (no lsof on this machine)"
fi

# 6. Optional: can the cluster run a locally built image? (spec T1 / Q1)
if [ "$IMAGE_PROBE" = true ]; then
  if [ "$CLUSTER_UP" = true ] && [ "$DOCKER_UP" = true ]; then
    if ! docker image inspect imdb/posts:local >/dev/null 2>&1; then
      echo "      (building imdb/posts:local for the probe, this takes a few minutes the first time)"
      (build_images imdb/posts:local) >/dev/null || fail "couldn't build imdb/posts:local" "Run: docker build -t imdb/posts:local backend/posts"
    fi
    ensure_namespace
    if docker image inspect imdb/posts:local >/dev/null 2>&1; then
      if (probe_image_sharing imdb/posts:local); then
        pass "cluster runs locally built images with no registry pull"
      else
        fail "cluster can't see locally built images" "See the message above."
      fi
    fi
  else
    warn "skipped the image probe (needs Docker and the cluster up)"
  fi
fi

echo
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "All checks passed — ./scripts/k8s-run.sh should work."
  exit 0
else
  echo "$FAIL_COUNT check(s) failed — fix the items above, then re-run this script."
  exit 1
fi
