#!/usr/bin/env bash
# Deterministic security scan, run through Docker so nothing is installed
# locally:
#   - Semgrep (OWASP Top 10 + language rules + secrets) on changed source files
#   - osv-scanner for known CVEs in dependency manifests (Maven incl.
#     transitive, npm lockfile, pip requirements) when a manifest changed
# Fails on Semgrep ERROR findings or dependency vulns with CVSS >= 7.0.
# Pattern-level only: authorization/IDOR/domain-scoping logic still needs
# the security-auditor agent (or a human).
#
# Usage:
#   ./scripts/security-scan.sh                     # changed files vs. main
#   ./scripts/security-scan.sh --base origin/main
#   ./scripts/security-scan.sh --all               # whole repo, all manifests
#
# Reports: .quality/semgrep.{json,txt}, .quality/osv.{json,txt} (gitignored).

if [ -n "${ZSH_VERSION:-}" ] || { [ -n "${BASH_VERSION:-}" ] && [ "${BASH_SOURCE[0]}" != "${0}" ]; }; then
  echo "Run this directly — ./scripts/security-scan.sh — don't source it." >&2
  return 1 2>/dev/null || exit 1
fi

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"
source "$SCRIPT_DIR/lib-tools.sh"

SEMGREP_IMAGE="semgrep/semgrep:1.177.0"
OSV_IMAGE="ghcr.io/google/osv-scanner:v2.6.0"
SEMGREP_CONFIGS="p/owasp-top-ten p/java p/typescript p/python p/secrets"
CVSS_FAIL_AT="7.0"

BASE_REF="main"
SCAN_ALL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE_REF="${2:?--base needs a ref}"; shift 2 ;;
    --all) SCAN_ALL=1; shift ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1 (see --help)" >&2; exit 2 ;;
  esac
done

if ! docker info >/dev/null 2>&1; then
  echo "Docker is unreachable — the scanners run in containers. Start Docker Desktop and retry." >&2
  exit 2
fi
mkdir -p "$OUT_DIR"

MANIFESTS="backend/posts/pom.xml frontend/imdb-ui-angular/package-lock.json backend/imdb-data-python/requirements.txt"
if [ "$SCAN_ALL" -eq 1 ]; then
  SOURCES="backend/posts/src frontend/imdb-ui-angular/src backend/imdb-data-python"
  SCAN_MANIFESTS="$MANIFESTS"
else
  MERGE_BASE="$(resolve_base "$BASE_REF")" || exit 2
  CHANGED="$(changed_files "$MERGE_BASE")"
  # Existing source files only (deleted files show up in the diff too).
  SOURCES=""
  for f in $(echo "$CHANGED" | grep -E '\.(java|ts|py|html|ya?ml|json|properties|sh)$|Dockerfile$' \
             | grep -v -E '(^|/)(package-lock\.json)$'); do
    [ -f "$f" ] && SOURCES="$SOURCES $f"
  done
  SCAN_MANIFESTS=""
  for m in $MANIFESTS; do
    echo "$CHANGED" | grep -qx "$m" && SCAN_MANIFESTS="$SCAN_MANIFESTS $m"
  done
  # A package.json change without a lockfile change still alters resolved deps.
  echo "$CHANGED" | grep -qx 'frontend/imdb-ui-angular/package.json' \
    && ! echo "$SCAN_MANIFESTS" | grep -q package-lock \
    && SCAN_MANIFESTS="$SCAN_MANIFESTS frontend/imdb-ui-angular/package-lock.json"
fi

FAILURES=""

# ── Semgrep ──────────────────────────────────────────────────────────────
if [ -z "${SOURCES// /}" ]; then
  echo "Semgrep: no changed source files — skipped."
  rm -f "$OUT_DIR/semgrep.json" "$OUT_DIR/semgrep.txt"
else
  echo "Semgrep ($SEMGREP_IMAGE) on:$([ "$SCAN_ALL" -eq 1 ] && echo " whole repo" || echo " $(echo $SOURCES | wc -w | tr -d " ") changed files")"
  config_args=""
  for c in $SEMGREP_CONFIGS; do config_args="$config_args --config $c"; done
  # shellcheck disable=SC2086
  docker run --rm -v "$ROOT_DIR:/src" -w /src "$SEMGREP_IMAGE" \
    semgrep scan $config_args --metrics=off --quiet --json --output /src/.quality/semgrep.json $SOURCES
  python3 - "$OUT_DIR/semgrep.json" >"$OUT_DIR/semgrep.txt" <<'EOF'
import json, sys
results = json.load(open(sys.argv[1])).get("results", [])
counts: dict[str, int] = {}
for r in results:
    sev = r["extra"].get("severity", "INFO")
    counts[sev] = counts.get(sev, 0) + 1
    print(f"{sev:8} {r['path']}:{r['start']['line']}  {r['check_id']}\n         {r['extra'].get('message', '').strip()[:300]}")
print(f"SUMMARY errors={counts.get('ERROR', 0)} warnings={counts.get('WARNING', 0)} info={counts.get('INFO', 0)}")
EOF
  summary="$(tail -1 "$OUT_DIR/semgrep.txt")"
  echo "  $summary (details: .quality/semgrep.txt)"
  echo "$summary" | grep -q 'errors=0 ' || FAILURES="$FAILURES semgrep"
fi

# ── osv-scanner ──────────────────────────────────────────────────────────
if [ -z "${SCAN_MANIFESTS// /}" ]; then
  echo "osv-scanner: no dependency manifest changed — skipped."
  rm -f "$OUT_DIR/osv.json" "$OUT_DIR/osv.txt"
else
  echo "osv-scanner ($OSV_IMAGE) on:$SCAN_MANIFESTS"
  lockfile_args=""
  for m in $SCAN_MANIFESTS; do
    case "$m" in
      *requirements.txt) lockfile_args="$lockfile_args -L requirements.txt:$m" ;;
      *) lockfile_args="$lockfile_args -L $m" ;;
    esac
  done
  # shellcheck disable=SC2086
  docker run --rm -v "$ROOT_DIR:/src" -w /src "$OSV_IMAGE" \
    scan source $lockfile_args --format json >"$OUT_DIR/osv.json" 2>/dev/null
  python3 - "$OUT_DIR/osv.json" "$CVSS_FAIL_AT" >"$OUT_DIR/osv.txt" <<'EOF'
import json, sys
data = json.load(open(sys.argv[1]))
fail_at = float(sys.argv[2])
blocking = total = 0
for result in data.get("results", []):
    source = result["source"]["path"]
    for pkg in result.get("packages", []):
        name, version = pkg["package"]["name"], pkg["package"]["version"]
        for group in pkg.get("groups", []):
            total += 1
            sev = group.get("max_severity") or "0"
            score = float(sev) if sev.replace(".", "", 1).isdigit() else 0.0
            if score >= fail_at:
                blocking += 1
            ids = ", ".join(group.get("aliases") or group.get("ids", []))
            print(f"CVSS {sev:>4}  {name}@{version}  ({source.removeprefix('/src/')})\n           {ids}")
print(f"SUMMARY vulns={total} blocking={blocking} (CVSS >= {fail_at})")
EOF
  summary="$(tail -1 "$OUT_DIR/osv.txt")"
  echo "  $summary (details: .quality/osv.txt)"
  echo "$summary" | grep -q 'blocking=0 ' || FAILURES="$FAILURES osv"
fi

echo
if [ -z "$FAILURES" ]; then
  echo "Security scan: PASS"
  exit 0
fi
echo "Security scan: FAIL ($FAILURES ) — see .quality/"
exit 1
