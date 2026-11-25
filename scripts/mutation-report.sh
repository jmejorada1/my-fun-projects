#!/usr/bin/env bash
# Report-only mutation testing: PIT for posts, Stryker for the Angular UI,
# on the source files changed since the base (or everything with --all).
# Never fails on results; the test-reviewer agent triages the survivors.
# Pipeline and local use only: too slow for CI.
#
# Usage:
#   ./scripts/mutation-report.sh                        # changed files vs. main
#   ./scripts/mutation-report.sh --base <ref>
#   ./scripts/mutation-report.sh --all [posts|frontend] # whole-codebase baseline
#
# Report: .quality/mutation-summary.md, plus the raw mutation-posts.xml and
# mutation-frontend.json and each tool's log (gitignored).

if [ -n "${ZSH_VERSION:-}" ] || { [ -n "${BASH_VERSION:-}" ] && [ "${BASH_SOURCE[0]}" != "${0}" ]; }; then
  echo "Run this directly — ./scripts/mutation-report.sh — don't source it." >&2
  return 1 2>/dev/null || exit 1
fi

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"
source "$SCRIPT_DIR/lib-tools.sh"

POSTS_DIR=backend/posts
FRONTEND_DIR=frontend/imdb-ui-angular
SUMMARY="$OUT_DIR/mutation-summary.md"

BASE_REF="main"
ALL=0
COMPONENTS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE_REF="${2:?--base needs a ref}"; shift 2 ;;
    --all) ALL=1; shift ;;
    posts|frontend) COMPONENTS="$COMPONENTS $1"; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1 (see --help)" >&2; exit 2 ;;
  esac
done
[ -z "$COMPONENTS" ] && COMPONENTS="posts frontend"

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/mutation-*

if [ "$ALL" -eq 1 ]; then
  BASE_REF="none (--all)"
  SCOPE="all files"
  CHANGED=""
else
  MERGE_BASE="$(resolve_base "$BASE_REF")" || exit 2
  SCOPE="files changed since $BASE_REF (${MERGE_BASE:0:10})"
  CHANGED="$(changed_files "$MERGE_BASE")"
fi

section() { printf '## %s\n\n%s\n\n' "$1" "$2" >>"$SUMMARY"; }

# Source files under $1 ending in $2, changed or (with --all) every one; deleted files dropped.
targets() {
  local dir="$1" suffix="$2" file
  if [ "$ALL" -eq 1 ]; then
    find "$dir" -name "*$suffix" | sort
    return
  fi
  echo "$CHANGED" | grep -E "^$dir/.*$suffix\$" | while read -r file; do
    [ -f "$file" ] && echo "$file"
  done
}

report_posts() {
  local src=$POSTS_DIR/src/main/java classes excluded_tests
  classes="$(targets "$src" .java | sed -e "s|^$src/||" -e 's|\.java$||' -e 's|/|.|g' | paste -sd, -)"
  if [ -z "$classes" ]; then
    section "posts (PIT)" "No changed source files."
    return
  fi
  # Unit tests only: each mutant reruns the tests, and Testcontainers ones are too slow.
  excluded_tests="$(grep -rl -i 'testcontainers' $POSTS_DIR/src/test --include='*.java' \
    | xargs -n1 basename | sed -e 's/\.java$//' -e 's/^/*./' | paste -sd, -)"
  echo "── posts: PIT"
  if ! (cd $POSTS_DIR && ./mvnw -q test-compile org.pitest:pitest-maven:mutationCoverage \
        -DtargetClasses="$classes" -DtargetTests='com.jp.projects.posts.*' \
        -DexcludedTestClasses="$excluded_tests") >"$OUT_DIR/mutation-posts.log" 2>&1; then
    section "posts (PIT)" "PIT failed; see .quality/mutation-posts.log."
    return
  fi
  cp $POSTS_DIR/target/pit-reports/mutations.xml "$OUT_DIR/mutation-posts.xml"
  section "posts (PIT)" "$(python3 -I "$SCRIPT_DIR/mutation-summary.py" pit "$src" "$OUT_DIR/mutation-posts.xml")"
}

report_frontend() {
  local file files="" skipped=""
  for file in $(targets $FRONTEND_DIR/src/app .ts | grep -v '\.spec\.ts$'); do
    if [ -f "${file%.ts}.spec.ts" ]; then
      files="$files ${file#$FRONTEND_DIR/}"
    else
      skipped="$skipped ${file#$FRONTEND_DIR/}"
    fi
  done
  local note=""
  [ -n "$skipped" ] && note="Not mutated (no matching .spec.ts):$(printf ' `%s`' $skipped)"
  if [ -z "$files" ]; then
    section "frontend (Stryker)" "No changed source files with a spec. $note"
    return
  fi
  # One run per file, so each mutant builds only its own spec and one
  # failing file doesn't lose the others' results.
  local total n=0 reports=() failed=""
  total=$(echo $files | wc -w | tr -d ' ')
  for file in $files; do
    n=$((n + 1))
    echo "── frontend: Stryker $n/$total $file"
    local name="${file//\//_}"
    rm -f $FRONTEND_DIR/reports/mutation/mutation.json
    if (cd $FRONTEND_DIR && STRYKER_FILES="$file" npx stryker run) >"$OUT_DIR/mutation-frontend-$name.log" 2>&1 \
        && [ -f $FRONTEND_DIR/reports/mutation/mutation.json ]; then
      cp $FRONTEND_DIR/reports/mutation/mutation.json "$OUT_DIR/mutation-frontend-$name.json"
      reports+=("$OUT_DIR/mutation-frontend-$name.json")
    else
      failed="$failed $file"
    fi
  done
  [ -n "$failed" ] && note="$note Stryker failed (see .quality/mutation-frontend-*.log):$(printf ' `%s`' $failed)"
  if [ ${#reports[@]} -eq 0 ]; then
    section "frontend (Stryker)" "$note"
    return
  fi
  section "frontend (Stryker)" "$(python3 -I "$SCRIPT_DIR/mutation-summary.py" stryker $FRONTEND_DIR "${reports[@]}")

$note"
}

cat >"$SUMMARY" <<EOF
# Mutation report

**Base:** $BASE_REF · **Scope:** $SCOPE · **Generated:** $(date '+%Y-%m-%d %H:%M:%S')

Only survived mutants need triage. "No coverage" means no unit test reached
the code; integration tests aren't run per mutant.

EOF

for comp in $COMPONENTS; do
  "report_$comp"
done

echo "Mutation report: $SUMMARY"
