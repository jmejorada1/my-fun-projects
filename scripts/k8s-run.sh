#!/usr/bin/env bash
# Deploys the whole stack to Docker Desktop's Kubernetes (context
# docker-desktop): precheck, install Envoy Gateway if missing, build the
# three :local images, create the namespace and Secrets from .env, render +
# apply the local overlay, then wait for the Gateway and every rollout.
# The app ends up at http://localhost:${FRONTEND_PORT} (UI at /, API at /api),
# the same URL as the compose stack. Only one of the two stacks runs at a time.
#
# Usage:
#   ./scripts/k8s-run.sh                               # deploy, no seeding
#   ./scripts/k8s-run.sh bigotry-data                  # + seed mock imdb/bigotry data
#   ./scripts/k8s-run.sh standard-data                 # + seed mock imdb/standard data
#   ./scripts/k8s-run.sh --all                         # + seed both
#   ./scripts/k8s-run.sh --render                      # only print the rendered YAML
#                                                      # (no cluster needed)
# Stop with ./scripts/k8s-shutdown.sh. See deploy/kubernetes/README.md.

if [ -n "${ZSH_VERSION:-}" ] || { [ -n "${BASH_VERSION:-}" ] && [ "${BASH_SOURCE[0]}" != "${0}" ]; }; then
  echo "Run this directly — ./scripts/k8s-run.sh — don't source it with '.' or 'source'." >&2
  echo "Sourcing runs it in your current shell instead of a fresh bash process, which breaks here" >&2
  echo "and can terminate your interactive shell entirely instead of just this script." >&2
  return 1 2>/dev/null || exit 1
fi

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib-k8s.sh"

LOAD_BIGOTRY_DATA=false
LOAD_STANDARD_DATA=false
RENDER_ONLY=false
for arg in "$@"; do
  case "$arg" in
    bigotry-data) LOAD_BIGOTRY_DATA=true ;;
    standard-data) LOAD_STANDARD_DATA=true ;;
    --all) LOAD_BIGOTRY_DATA=true; LOAD_STANDARD_DATA=true ;;
    --render) RENDER_ONLY=true ;;
    -h|--help) print_header_help "$0"; exit 0 ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $(basename "$0") [bigotry-data] [standard-data] [--all] [--render]" >&2
      exit 1
      ;;
  esac
done

if [ "$RENDER_ONLY" = true ]; then
  render_local
  exit $?
fi

if ! "$SCRIPT_DIR/k8s-precheck.sh"; then
  echo
  echo "Precheck failed — not deploying. Fix the item(s) above and try again."
  exit 1
fi

echo
ensure_envoy_gateway

echo
build_images imdb/posts:local imdb/frontend:local imdb/loaders:local

echo
echo "Creating namespace and Secrets from .env..."
ensure_namespace
ensure_secrets

echo "Checking the cluster can see the locally built images..."
probe_image_sharing imdb/posts:local || exit 1

echo
echo "Applying manifests..."
RENDERED="$(render_local)" || die "Rendering the overlay failed. See the error above."
printf '%s\n' "$RENDERED" | kc apply -f - || die "kubectl apply failed. See the error above."

echo
echo "Waiting for the Gateway to be programmed..."
if ! kc wait -n "$K8S_NAMESPACE" gateway/imdb --for=condition=Programmed --timeout=2m >/dev/null; then
  echo "  The imdb Gateway isn't Programmed yet. If the cluster can't give its LoadBalancer an" >&2
  echo "  address, run ./scripts/k8s-port-forward.sh gateway (see the README's troubleshooting)." >&2
  echo "  Status: kubectl --context $K8S_CONTEXT describe gateway imdb -n $K8S_NAMESPACE" >&2
fi

echo "Waiting for rollouts (up to 5 min each)..."
for workload in statefulset/postgres deployment/posts deployment/frontend deployment/prometheus deployment/grafana; do
  if ! kc rollout status -n "$K8S_NAMESPACE" "$workload" --timeout=5m; then
    echo >&2
    echo "$workload didn't become ready. Inspect it with:" >&2
    echo "  kubectl --context $K8S_CONTEXT get pods -n $K8S_NAMESPACE" >&2
    echo "  kubectl --context $K8S_CONTEXT describe -n $K8S_NAMESPACE $workload" >&2
    echo "  kubectl --context $K8S_CONTEXT logs -n $K8S_NAMESPACE $workload --all-containers" >&2
    exit 1
  fi
done

if [ "$LOAD_BIGOTRY_DATA" = true ]; then
  echo
  echo "Seeding mock bigotry data..."
  "$SCRIPT_DIR/k8s-load.sh" bigotry || die "bigotry loader failed. The stack is still running."
fi

if [ "$LOAD_STANDARD_DATA" = true ]; then
  echo
  echo "Seeding mock standard data..."
  "$SCRIPT_DIR/k8s-load.sh" standard || die "standard loader failed. The stack is still running."
fi

APP_URL="http://localhost:${FRONTEND_PORT}"
echo
if curl -s -o /dev/null --max-time 5 "$APP_URL/"; then
  echo "Stack is running on Kubernetes ($K8S_CONTEXT, namespace $K8S_NAMESPACE)."
else
  echo "Stack is deployed, but $APP_URL isn't answering yet. If it stays that way, run"
  echo "./scripts/k8s-port-forward.sh gateway (see deploy/kubernetes/README.md#troubleshooting)."
fi
echo "  Frontend:   $APP_URL"
echo "  API:        $APP_URL/api/swagger-ui.html"
echo "  Monitoring: ./scripts/k8s-port-forward.sh   (Postgres, Prometheus, Grafana on their .env ports)"
echo "  Smoke test: ./scripts/k8s-smoke-test.sh"
echo "  Pods:       kubectl --context $K8S_CONTEXT get pods -n $K8S_NAMESPACE"
echo "  Stop:       ./scripts/k8s-shutdown.sh"
