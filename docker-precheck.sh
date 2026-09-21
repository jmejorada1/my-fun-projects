#!/usr/bin/env bash
# Sanity-checks this machine before `docker compose up --build` — catches
# the usual first-run failures (Docker not running, compose file broken,
# a host port already taken) with an actionable message instead of a raw
# Docker error. Exits 0 if the stack should be able to start, non-zero
# otherwise.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Keep in sync with the host-side `ports:` entries in docker-compose.yml.
REQUIRED_PORTS=(4200 8080 5433)

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

echo "Checking this repo's Docker setup..."
echo

# 1. Docker CLI installed.
if command -v docker >/dev/null 2>&1; then
  pass "docker CLI found"
else
  fail "docker CLI not found" \
    "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
fi

# 2. Docker daemon reachable (only meaningful if the CLI exists).
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    pass "Docker daemon is running"
  else
    fail "Docker daemon isn't reachable" \
      "Start Docker Desktop (or your Docker service), then re-run this script."
  fi
fi

# 3. Compose v2 plugin available.
if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    pass "docker compose plugin available"
  else
    fail "docker compose plugin not available" \
      "Update Docker Desktop, or install the docker-compose-plugin package."
  fi
fi

# 4. docker-compose.yml present and valid.
if [ -f "$SCRIPT_DIR/docker-compose.yml" ]; then
  if command -v docker >/dev/null 2>&1 && docker compose config >/dev/null 2>&1; then
    pass "docker-compose.yml is valid"
  elif command -v docker >/dev/null 2>&1; then
    fail "docker-compose.yml failed to validate" \
      "Run 'docker compose config' from the repo root to see the parse error."
  fi
else
  fail "docker-compose.yml not found in $SCRIPT_DIR" \
    "This script must live at the repo root, next to docker-compose.yml."
fi

# 5. Host ports docker-compose.yml needs to publish must be free.
port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  elif command -v nc >/dev/null 2>&1; then
    nc -z localhost "$port" >/dev/null 2>&1
    return $?
  fi
  return 2
}

for port in "${REQUIRED_PORTS[@]}"; do
  port_in_use "$port"
  case $? in
    0) fail "port $port is already in use" \
         "Find what's using it: lsof -nP -iTCP:$port -sTCP:LISTEN" ;;
    1) pass "port $port is free" ;;
    *) warn "couldn't check port $port — no lsof or nc on this machine" ;;
  esac
done

echo
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "All checks passed — 'docker compose up --build' should work."
  exit 0
else
  echo "$FAIL_COUNT check(s) failed — fix the items above, then re-run this script."
  exit 1
fi
