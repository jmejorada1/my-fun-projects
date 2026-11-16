#!/usr/bin/env bash
# Phase 1 of docs/specs/kubernetes-local/verification.md: static checks that
# need no Docker and no cluster (spec tests V1-V3). Exit code = number of
# failed checks, so 0 means everything passed.
#
#   V1  every k8s script (and lib-k8s.sh) is valid bash; shellcheck if installed
#   P4  context guard: no script calls kubectl except through kc(), so none
#       can act on your *current* context (e.g. a real EKS cluster)
#   V2  every k8s script prints --help and refuses to be sourced;
#       lib-k8s.sh refuses to be run directly
#   V3  the local overlay renders, contains every expected object, has no
#       Secret and no :latest image, uses IfNotPresent for the imdb/* images,
#       pins the same third-party images as docker-compose.yml, leaves the
#       GatewayClass cluster-scoped, and takes FRONTEND_PORT from .env
#       (checked with a different port, without touching your .env)
#
# Usage:
#   ./scripts/k8s-verify-static.sh

if [ -n "${ZSH_VERSION:-}" ] || { [ -n "${BASH_VERSION:-}" ] && [ "${BASH_SOURCE[0]}" != "${0}" ]; }; then
  echo "Run this directly — ./scripts/k8s-verify-static.sh — don't source it with '.' or 'source'." >&2
  echo "Sourcing runs it in your current shell instead of a fresh bash process, which breaks here" >&2
  echo "and can terminate your interactive shell entirely instead of just this script." >&2
  return 1 2>/dev/null || exit 1
fi

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib-k8s.sh"

case "${1:-}" in
  -h|--help) print_header_help "$0"; exit 0 ;;
  '') ;;
  *) echo "Usage: $(basename "$0")" >&2; exit 1 ;;
esac

FAILURES=0
pass() { printf '  \033[32m\xe2\x9c\x93\033[0m %s\n' "$1"; }
fail() {
  printf '  \033[31m\xe2\x9c\x97\033[0m %s\n' "$1"
  [ -n "${2:-}" ] && printf '      %s\n' "$2"
  FAILURES=$((FAILURES + 1))
}
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }

K8S_SCRIPTS=(scripts/k8s-*.sh)

echo "V1: syntax"
for f in scripts/lib-k8s.sh "${K8S_SCRIPTS[@]}"; do
  if err="$(bash -n "$f" 2>&1)"; then pass "$f"; else fail "$f" "$err"; fi
done
if command -v shellcheck >/dev/null 2>&1; then
  if out="$(shellcheck -S warning scripts/lib-k8s.sh "${K8S_SCRIPTS[@]}" 2>&1)"; then
    pass "shellcheck (warnings and above)"
  else
    fail "shellcheck found issues" "Run: shellcheck -S warning scripts/lib-k8s.sh scripts/k8s-*.sh"
    printf '%s\n' "$out" | head -20 | sed 's/^/      /'
  fi
else
  warn "shellcheck not installed, skipped (brew install shellcheck)"
fi

echo
echo "P4: context guard (no kubectl call can reach a cluster other than $K8S_CONTEXT)"
# Every cluster-touching call must go through kc(), which pins
# --context "$K8S_CONTEXT". Comments and quoted text (hint messages) are
# ignored, except double-quoted strings containing $(...), since
# x="$(kubectl ...)" is a real call. Allowed bare kubectl uses: the kc() definition itself, the
# offline `kubectl kustomize` render, read-only `kubectl config` queries,
# and `command -v kubectl`. Anything else could act on whatever your
# current context is, e.g. a real EKS cluster.
CONTEXT_VIOLATIONS=""
for f in scripts/lib-k8s.sh "${K8S_SCRIPTS[@]}"; do
  [ "$f" = "scripts/k8s-verify-static.sh" ] && continue   # this check's own patterns
  n=0
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1))
    code="$(printf '%s' "$line" | sed -E 's/\\"//g; s/"([^"$]|\$[^(])*"//g; s/'"'"'[^'"'"']*'"'"'//g; s/(^|[[:space:]])#.*//')"
    printf '%s' "$code" | grep -Eq '(^|[^[:alnum:]_-])kubectl([^[:alnum:]_-]|$)' || continue
    printf '%s' "$line" | grep -Fq 'kubectl --context "$K8S_CONTEXT"' && continue
    printf '%s' "$code" | grep -Eq 'kubectl kustomize|kubectl config (get-contexts|view|current-context)|command -v kubectl' && continue
    CONTEXT_VIOLATIONS+="$f:$n: $line"$'\n'
  done < "$f"
done
if [ -z "$CONTEXT_VIOLATIONS" ]; then
  pass "every kubectl call goes through kc() (--context $K8S_CONTEXT)"
else
  fail "kubectl called without the context guard. Use kc instead:"
  printf '%s' "$CONTEXT_VIOLATIONS" | sed 's/^/      /'
fi

echo
echo "V2: --help and the sourcing guard"
for f in "${K8S_SCRIPTS[@]}"; do
  if "$f" --help >/dev/null 2>&1; then pass "$f --help"; else fail "$f --help exited non-zero"; fi
  if bash -c "source '$f'" >/dev/null 2>&1; then
    fail "$f can be sourced" "The guard at the top of the script should refuse this."
  else
    pass "$f refuses to be sourced"
  fi
done
if bash scripts/lib-k8s.sh >/dev/null 2>&1; then
  fail "scripts/lib-k8s.sh runs directly" "It should refuse: it's a library."
else
  pass "scripts/lib-k8s.sh refuses to run directly"
fi

echo
echo "V3: rendered manifests (FRONTEND_PORT=$FRONTEND_PORT from .env)"
RENDERED="$(render_local 2>&1)"
if [ $? -ne 0 ]; then
  fail "overlay failed to render" "$(printf '%s' "$RENDERED" | head -5)"
  echo
  echo "$FAILURES check(s) failed. The rest of V3 needs a render, so it was skipped."
  exit "$FAILURES"
fi
pass "overlay renders ($(printf '%s\n' "$RENDERED" | grep -c '^kind:') objects)"

# kind/name of every rendered object. Generated ConfigMap names lose their
# content-hash suffix so the list below stays stable.
OBJECTS="$(printf '%s\n' "$RENDERED" | awk '/^kind:/ {k=$2} /^  name:/ {print k "/" $2}' \
  | sed -E 's#^(ConfigMap/.*)-[a-z0-9]{10}$#\1#')"
for expected in \
  Namespace/imdb StatefulSet/postgres Service/postgres \
  Deployment/posts Service/posts Deployment/frontend Service/frontend \
  Deployment/prometheus Service/prometheus PersistentVolumeClaim/prometheus-data ConfigMap/prometheus-config \
  Deployment/grafana Service/grafana PersistentVolumeClaim/grafana-data \
  ConfigMap/grafana-datasources ConfigMap/grafana-dashboards \
  GatewayClass/imdb Gateway/imdb HTTPRoute/imdb; do
  if printf '%s\n' "$OBJECTS" | grep -qx "$expected"; then
    pass "has $expected"
  else
    fail "missing $expected"
  fi
done

if printf '%s\n' "$RENDERED" | grep -q '^kind: Secret'; then
  fail "a Secret is rendered" "Secrets must only come from the scripts (ensure_secrets), never from Kustomize."
else
  pass "no Secret in the output"
fi
if printf '%s\n' "$RENDERED" | grep -q 'image: .*:latest'; then
  fail "a :latest image is rendered"
else
  pass "no :latest image"
fi

for image in imdb/posts:local imdb/frontend:local; do
  if printf '%s\n' "$RENDERED" | grep -A1 "image: $image\$" | grep -q 'imagePullPolicy: IfNotPresent'; then
    pass "$image uses imagePullPolicy IfNotPresent"
  else
    fail "$image is missing, or doesn't use imagePullPolicy IfNotPresent"
  fi
done

# Same third-party pins as compose, so the two stacks can't drift.
for image in $(awk '/^    image:/ {print $2}' docker-compose.yml | sort -u); do
  if printf '%s\n' "$RENDERED" | grep -q "image: $image\$"; then
    pass "pins $image (same as docker-compose.yml)"
  else
    fail "doesn't use $image, which docker-compose.yml pins"
  fi
done

if printf '%s\n' "$RENDERED" | awk '/^kind: GatewayClass/ {g=1} /^---/ {g=0} g && /^  namespace:/ {found=1} END {exit !found}'; then
  fail "GatewayClass has a namespace" "It's cluster-scoped. Check the overlay doesn't set a namespace: transformer."
else
  pass "GatewayClass is cluster-scoped (no namespace)"
fi

# FRONTEND_PORT really comes from .env: render again with a different port
# (in a subshell, so .env and this shell's value stay untouched) and check
# both places it lands.
ALT_PORT=$((FRONTEND_PORT == 4300 ? 4301 : 4300))
ALT_RENDERED="$( (FRONTEND_PORT="$ALT_PORT"; render_local) 2>&1)"
write_env_patch   # put the .generated/ patches back to your real .env values
if printf '%s\n' "$ALT_RENDERED" | grep -q "port: $ALT_PORT\$"; then
  pass "Gateway listener follows FRONTEND_PORT (tried $ALT_PORT)"
else
  fail "Gateway listener didn't change to $ALT_PORT"
fi
if printf '%s\n' "$ALT_RENDERED" | grep -q "value: http://localhost:$ALT_PORT\$"; then
  pass "posts CORS origin follows FRONTEND_PORT (tried $ALT_PORT)"
else
  fail "APP_CORS_ALLOWED_ORIGINS didn't change to http://localhost:$ALT_PORT"
fi
if printf '%s\n' "$ALT_RENDERED" | grep -qE "(port: |localhost:)$FRONTEND_PORT\$"; then
  fail "the old port $FRONTEND_PORT is still hard-coded somewhere" \
    "Run: ./scripts/k8s-run.sh --render | grep -n $FRONTEND_PORT"
else
  pass "no hard-coded $FRONTEND_PORT left"
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "All static checks passed. Next: Phase 2 in docs/specs/kubernetes-local/verification.md"
else
  echo "$FAILURES static check(s) failed."
fi
exit "$FAILURES"
