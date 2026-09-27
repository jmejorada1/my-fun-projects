#!/usr/bin/env bash
# Deterministic quality gate: runs each touched component's test suite with
# coverage, then fails if line coverage of the lines changed since the base
# is below the threshold (diff-cover). Same check locally, in the feature
# pipeline, and in CI.
#
# Usage:
#   ./scripts/quality-gate.sh                          # vs. main, 85%, touched components only
#   ./scripts/quality-gate.sh --base origin/main --threshold 90
#   ./scripts/quality-gate.sh --unit-only              # skip Testcontainers-backed posts tests
#   ./scripts/quality-gate.sh posts frontend loaders   # force these components
#
# Reports: .quality/diff-cover-<component>.md (gitignored).

if [ -n "${ZSH_VERSION:-}" ] || { [ -n "${BASH_VERSION:-}" ] && [ "${BASH_SOURCE[0]}" != "${0}" ]; }; then
  echo "Run this directly — ./scripts/quality-gate.sh — don't source it." >&2
  return 1 2>/dev/null || exit 1
fi

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"
source "$SCRIPT_DIR/lib-tools.sh"

BASE_REF="main"
THRESHOLD=85
UNIT_ONLY=0
COMPONENTS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE_REF="${2:?--base needs a ref}"; shift 2 ;;
    --threshold) THRESHOLD="${2:?--threshold needs a number}"; shift 2 ;;
    --unit-only) UNIT_ONLY=1; shift ;;
    posts|frontend|loaders) COMPONENTS="$COMPONENTS $1"; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1 (see --help)" >&2; exit 2 ;;
  esac
done

MERGE_BASE="$(resolve_base "$BASE_REF")" || exit 2
if [ -z "$COMPONENTS" ]; then
  COMPONENTS="$(touched_components "$(changed_files "$MERGE_BASE")")"
fi
if [ -z "${COMPONENTS// /}" ]; then
  echo "No component changes since $BASE_REF ($MERGE_BASE) — nothing to gate."
  exit 0
fi

echo "Quality gate: base=$BASE_REF (${MERGE_BASE:0:10}), threshold=${THRESHOLD}%, components:$COMPONENTS"
ensure_tools_venv || { echo "Failed to set up .venv-tools/." >&2; exit 2; }
mkdir -p "$OUT_DIR"

FAILURES=""
RESULTS=""
record() { RESULTS="$RESULTS\n  $1"; }
fail() { FAILURES="$FAILURES $1"; record "FAIL  $1"; }

# Runs diff-cover for one component's coverage report.
diff_gate() {
  local comp="$1" report="$2"
  shift 2
  if [ ! -f "$report" ]; then
    fail "$comp: coverage report missing ($report)"
    return
  fi
  if "$VENV_DIR/bin/diff-cover" "$report" \
      --compare-branch="$MERGE_BASE" \
      --include-untracked \
      --fail-under="$THRESHOLD" \
      --format "markdown:$OUT_DIR/diff-cover-$comp.md" "$@" >"$OUT_DIR/diff-cover-$comp.txt" 2>&1; then
    record "PASS  $comp: $(grep -E '^Coverage:' "$OUT_DIR/diff-cover-$comp.txt" || echo 'no changed lines with coverage data')"
  else
    fail "$comp: $(grep -E '^Coverage:' "$OUT_DIR/diff-cover-$comp.txt" || echo 'diff-cover error') — see .quality/diff-cover-$comp.md"
  fi
}

gate_posts() {
  local test_args=""
  if [ "$UNIT_ONLY" -eq 1 ]; then
    # Exclude any test class that uses Testcontainers.
    local excludes
    excludes="$(grep -rl -i 'testcontainers' backend/posts/src/test --include='*.java' \
      | xargs -n1 basename | sed -e 's/\.java$//' -e 's/^/!/' | paste -sd, -)"
    [ -n "$excludes" ] && test_args="-Dtest=$excludes -Dsurefire.failIfNoSpecifiedTests=false"
  elif ! docker info >/dev/null 2>&1; then
    echo "WARNING: Docker unreachable; Testcontainers tests will fail. Use --unit-only to skip them." >&2
  fi
  echo "── posts: ./mvnw test ${test_args}"
  # shellcheck disable=SC2086
  if ! (cd backend/posts && ./mvnw -q test $test_args); then
    fail "posts: tests failed"
    return
  fi
  # JaCoCo paths are relative to the source root, not the repo root.
  diff_gate posts backend/posts/target/site/jacoco/jacoco.xml --src-roots backend/posts/src/main/java
}

gate_frontend() {
  echo "── frontend: ng test --coverage"
  if ! (cd frontend/imdb-ui-angular && npx ng test --no-watch --coverage \
        --coverage-reporters=cobertura --coverage-reporters=text-summary \
        --coverage-include='src/app/**/*.ts'); then
    fail "frontend: tests failed"
    return
  fi
  diff_gate frontend frontend/imdb-ui-angular/coverage/imdb-ui-angular/cobertura-coverage.xml
}

gate_loaders() {
  echo "── loaders: pytest --cov"
  local rc=0
  (cd backend/imdb-data-python && "$VENV_DIR/bin/python" -m pytest -q \
     --cov --cov-report=xml:coverage.xml) || rc=$?
  # 5 = no tests collected; still gate, so untested changes fail on coverage.
  if [ "$rc" -ne 0 ] && [ "$rc" -ne 5 ]; then
    fail "loaders: tests failed"
    return
  fi
  diff_gate loaders backend/imdb-data-python/coverage.xml
}

for comp in $COMPONENTS; do
  "gate_$comp"
done

echo
echo -e "Quality gate results (threshold ${THRESHOLD}% on changed lines):$RESULTS"
[ -z "$FAILURES" ] && exit 0 || exit 1
