#!/usr/bin/env bash
# Curl checks S1-S6 (spec §7.2) against the running app. Exit code = number
# of failed checks, so 0 means healthy. Takes a base URL so it can be pointed
# at another deployment later (e.g. EKS).
#
# Usage:
#   ./scripts/k8s-smoke-test.sh                          # http://localhost:${FRONTEND_PORT:-4200}
#   ./scripts/k8s-smoke-test.sh https://example.com      # any other deployment

if [ -n "${ZSH_VERSION:-}" ] || { [ -n "${BASH_VERSION:-}" ] && [ "${BASH_SOURCE[0]}" != "${0}" ]; }; then
  echo "Run this directly — ./scripts/k8s-smoke-test.sh — don't source it with '.' or 'source'." >&2
  echo "Sourcing runs it in your current shell instead of a fresh bash process, which breaks here" >&2
  echo "and can terminate your interactive shell entirely instead of just this script." >&2
  return 1 2>/dev/null || exit 1
fi

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib-k8s.sh"

case "${1:-}" in
  -h|--help) print_header_help "$0"; exit 0 ;;
esac
BASE_URL="${1:-http://localhost:${FRONTEND_PORT}}"
BASE_URL="${BASE_URL%/}"

FAILURES=0
pass() { printf '  \033[32m\xe2\x9c\x93\033[0m %s\n' "$1"; }
fail() {
  printf '  \033[31m\xe2\x9c\x97\033[0m %s\n' "$1"
  [ -n "${2:-}" ] && printf '      %s\n' "$2"
  FAILURES=$((FAILURES + 1))
}

BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

# get <path> [curl args...] -> sets STATUS and CTYPE, body in $BODY_FILE.
get() {
  local path="$1" out; shift
  out="$(curl -s -o "$BODY_FILE" -w '%{http_code} %{content_type}' --max-time 15 "$@" "$BASE_URL$path")"
  STATUS="${out%% *}"
  CTYPE="${out#* }"
}

echo "Smoke-testing $BASE_URL ..."
echo

get /
if [ "$STATUS" = 200 ] && [[ "$CTYPE" == text/html* ]]; then
  pass "S1 GET / -> 200 text/html"
else
  fail "S1 GET / -> expected 200 text/html, got $STATUS $CTYPE"
fi

get /config.json
if [ "$STATUS" = 200 ] && grep -Eq '"apiBaseUrl": *"/api"' "$BODY_FILE"; then
  pass "S2 GET /config.json -> apiBaseUrl is /api"
else
  fail "S2 GET /config.json -> expected {\"apiBaseUrl\": \"/api\"}, got $STATUS: $(head -c 200 "$BODY_FILE")"
fi

get /api/post-types -H 'X-Domain: imdb/bigotry'
if [ "$STATUS" = 200 ] && [ "$(head -c 1 "$BODY_FILE")" = "[" ]; then
  pass "S3 GET /api/post-types (X-Domain: imdb/bigotry) -> 200 JSON array"
else
  fail "S3 GET /api/post-types -> expected 200 JSON array, got $STATUS: $(head -c 200 "$BODY_FILE")"
fi

get /api/swagger-ui.html -L
if [ "$STATUS" = 200 ]; then
  pass "S4 GET /api/swagger-ui.html -> 200 (after redirects)"
else
  fail "S4 GET /api/swagger-ui.html -> expected 200, got $STATUS"
fi

# S5: actuator must not be reachable through the Gateway. /api/actuator/...
# goes to posts' main port, where actuator isn't served. /actuator/... falls
# through to the frontend rule, so nginx answers it with the SPA's
# index.html (a 200, but not actuator's JSON).
get /api/actuator/health
if [ "$STATUS" != 200 ]; then
  pass "S5 GET /api/actuator/health -> $STATUS (management not routed)"
else
  fail "S5 GET /api/actuator/health -> 200: actuator is reachable through the Gateway"
fi
get /actuator/health
if ! grep -q '"status"' "$BODY_FILE"; then
  pass "S5 GET /actuator/health -> no actuator JSON (served by the frontend fallback)"
else
  fail "S5 GET /actuator/health -> returned actuator JSON: management is reachable"
fi

get /some/deep/angular/route
if [ "$STATUS" = 200 ] && [[ "$CTYPE" == text/html* ]]; then
  pass "S6 GET /some/deep/angular/route -> 200 index.html (SPA fallback)"
else
  fail "S6 GET /some/deep/angular/route -> expected 200 text/html, got $STATUS $CTYPE"
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "All smoke checks passed."
else
  echo "$FAILURES smoke check(s) failed."
fi
exit "$FAILURES"
