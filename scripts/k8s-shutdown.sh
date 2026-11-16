#!/usr/bin/env bash
# Stops the k8s stack. By default PVCs (Postgres, Prometheus, Grafana data)
# and Secrets are kept, like `docker compose down` keeping volumes, so the
# next ./scripts/k8s-run.sh comes back with the same data. Envoy Gateway
# itself stays installed (uninstall command: deploy/kubernetes/README.md).
#
# Usage:
#   ./scripts/k8s-shutdown.sh          # stop everything, keep data
#   ./scripts/k8s-shutdown.sh --all    # also delete namespace imdb (ALL data)
#                                      # and GatewayClass imdb

if [ -n "${ZSH_VERSION:-}" ] || { [ -n "${BASH_VERSION:-}" ] && [ "${BASH_SOURCE[0]}" != "${0}" ]; }; then
  echo "Run this directly — ./scripts/k8s-shutdown.sh — don't source it with '.' or 'source'." >&2
  echo "Sourcing runs it in your current shell instead of a fresh bash process, which breaks here" >&2
  echo "and can terminate your interactive shell entirely instead of just this script." >&2
  return 1 2>/dev/null || exit 1
fi

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib-k8s.sh"

WIPE=false
for arg in "$@"; do
  case "$arg" in
    --all) WIPE=true ;;
    -h|--help) print_header_help "$0"; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; echo "Usage: $(basename "$0") [--all]" >&2; exit 1 ;;
  esac
done

kc get nodes --request-timeout=10s >/dev/null 2>&1 \
  || die "Kubernetes cluster '$K8S_CONTEXT' isn't reachable. Is Docker Desktop (with Kubernetes) running?"

if [ "$WIPE" = true ]; then
  echo "Deleting namespace $K8S_NAMESPACE (all workloads AND data) and GatewayClass imdb..."
  kc delete namespace "$K8S_NAMESPACE" --ignore-not-found --timeout=3m || die "Namespace delete failed or timed out."
  kc delete gatewayclass imdb --ignore-not-found --timeout=1m || die "GatewayClass delete failed or timed out."
else
  echo "Stopping the stack (PVCs and Secrets kept — pass --all to wipe them too)..."
  kc delete -n "$K8S_NAMESPACE" deployment,statefulset,service,configmap,job,httproute,gateway \
    -l "$PART_OF_LABEL" --ignore-not-found --timeout=3m || die "Delete failed. See the error above."
fi

echo "Done."
