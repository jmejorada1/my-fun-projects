#!/usr/bin/env bash
# Opens on-demand tunnels from 127.0.0.1 to the in-cluster services that the
# Gateway doesn't route, on the same host ports compose publishes (.env).
# Runs in the foreground; Ctrl-C closes every tunnel it opened.
#
# Usage:
#   ./scripts/k8s-port-forward.sh               # all three (default)
#   ./scripts/k8s-port-forward.sh postgres      # localhost:${POSTGRES_PORT:-5433}
#   ./scripts/k8s-port-forward.sh prometheus    # localhost:${PROMETHEUS_PORT:-9090}
#   ./scripts/k8s-port-forward.sh grafana       # localhost:${GRAFANA_PORT:-3000}
#   ./scripts/k8s-port-forward.sh gateway       # localhost:${FRONTEND_PORT:-4200}, the app itself.
#                                               # Only needed if the cluster doesn't publish
#                                               # LoadBalancer Services on localhost.

if [ -n "${ZSH_VERSION:-}" ] || { [ -n "${BASH_VERSION:-}" ] && [ "${BASH_SOURCE[0]}" != "${0}" ]; }; then
  echo "Run this directly — ./scripts/k8s-port-forward.sh — don't source it with '.' or 'source'." >&2
  echo "Sourcing runs it in your current shell instead of a fresh bash process, which breaks here" >&2
  echo "and can terminate your interactive shell entirely instead of just this script." >&2
  return 1 2>/dev/null || exit 1
fi

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib-k8s.sh"

TARGET="${1:-all}"
[ "$#" -gt 1 ] && die "Usage: $(basename "$0") [postgres|prometheus|grafana|gateway|all]"

forward() {  # forward <namespace> <service> <local port> <service port>
  echo "Forwarding 127.0.0.1:$3 -> $1/svc/$2:$4"
  kc -n "$1" port-forward --address 127.0.0.1 "svc/$2" "$3:$4"
}

case "$TARGET" in
  -h|--help) print_header_help "$0"; exit 0 ;;
  postgres)   forward "$K8S_NAMESPACE" postgres "$POSTGRES_PORT" 5432 ;;
  prometheus) forward "$K8S_NAMESPACE" prometheus "$PROMETHEUS_PORT" 9090 ;;
  grafana)    forward "$K8S_NAMESPACE" grafana "$GRAFANA_PORT" 3000 ;;
  gateway)
    SVC="$(envoy_service_name)"
    [ -n "$SVC" ] || die "No Envoy Service for the imdb Gateway yet. Deploy first: ./scripts/k8s-run.sh"
    forward envoy-gateway-system "$SVC" "$FRONTEND_PORT" "$FRONTEND_PORT"
    ;;
  all)
    PIDS=()
    cleanup() { kill "${PIDS[@]}" 2>/dev/null; }
    trap cleanup EXIT
    trap 'exit 130' INT TERM
    forward "$K8S_NAMESPACE" postgres "$POSTGRES_PORT" 5432 & PIDS+=($!)
    forward "$K8S_NAMESPACE" prometheus "$PROMETHEUS_PORT" 9090 & PIDS+=($!)
    forward "$K8S_NAMESPACE" grafana "$GRAFANA_PORT" 3000 & PIDS+=($!)
    echo "Press Ctrl-C to close all three."
    # Stay up while every tunnel lives; if any one dies, stop the rest.
    while kill -0 "${PIDS[@]}" 2>/dev/null; do sleep 1; done
    echo "A port-forward exited (see above). Closing the others." >&2
    exit 1
    ;;
  *) die "Usage: $(basename "$0") [postgres|prometheus|grafana|gateway|all]" ;;
esac
