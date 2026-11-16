#!/usr/bin/env bash
# Runs one data loader as a Kubernetes Job in the imdb namespace: the k8s
# version of `docker compose run --rm <x>-loader`. One attempt, no retries.
# Streams the pod's logs, deletes the Job on success, and keeps it on failure
# so you can inspect it. The DB password comes from Secret
# postgres-credentials (i.e. .env), not config.yaml.
#
# Usage:
#   ./scripts/k8s-load.sh <imdb|bigotry|standard> [loader args...]
# Examples:
#   ./scripts/k8s-load.sh bigotry
#   ./scripts/k8s-load.sh standard --total-posts 200
#   ./scripts/k8s-load.sh imdb --domain imdb/standard --start-row 1 --end-row 100
# Builds imdb/loaders:local first if it doesn't exist yet. After changing
# loader code, rebuild it: docker build -t imdb/loaders:local backend/imdb-data-python

if [ -n "${ZSH_VERSION:-}" ] || { [ -n "${BASH_VERSION:-}" ] && [ "${BASH_SOURCE[0]}" != "${0}" ]; }; then
  echo "Run this directly — ./scripts/k8s-load.sh — don't source it with '.' or 'source'." >&2
  echo "Sourcing runs it in your current shell instead of a fresh bash process, which breaks here" >&2
  echo "and can terminate your interactive shell entirely instead of just this script." >&2
  return 1 2>/dev/null || exit 1
fi

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib-k8s.sh"

USAGE="Usage: $(basename "$0") <imdb|bigotry|standard> [loader args...]"

case "${1:-}" in
  -h|--help) print_header_help "$0"; exit 0 ;;
  imdb)     LOADER=imdb;     PY_SCRIPT=import_resources.py ;;
  bigotry)  LOADER=bigotry;  PY_SCRIPT=import_bigotry_data.py ;;
  standard) LOADER=standard; PY_SCRIPT=import_standard_data.py ;;
  *) echo "$USAGE" >&2; exit 1 ;;
esac
shift

kc get namespace "$K8S_NAMESPACE" >/dev/null 2>&1 \
  || die "Namespace $K8S_NAMESPACE not found on $K8S_CONTEXT. Start the stack first: ./scripts/k8s-run.sh"

if ! docker image inspect imdb/loaders:local >/dev/null 2>&1; then
  build_images imdb/loaders:local
fi

# YAML single-quoted scalar: double any embedded '. Also escape $( as $$(
# so Kubernetes doesn't treat user text as a $(VAR) reference.
yaml_quote() {
  local q="'" ref='$(' escaped_ref='$$(' s
  s="${1//"$q"/$q$q}"
  s="${s//"$ref"/$escaped_ref}"
  printf "'%s'" "$s"
}

USER_ARGS=""
for arg in "$@"; do
  USER_ARGS+="            - $(yaml_quote "$arg")"$'\n'
done

JOB="${LOADER}-loader-$(date +%s)"

# Kubernetes expands $(POSTGRES_PASSWORD) in args from the env var below.
kc apply -f - >/dev/null <<YAML || die "Couldn't create Job $JOB."
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB}
  namespace: ${K8S_NAMESPACE}
  labels:
    app.kubernetes.io/name: ${LOADER}-loader
    app.kubernetes.io/part-of: imdb
spec:
  backoffLimit: 0
  ttlSecondsAfterFinished: 3600
  template:
    metadata:
      labels:
        app.kubernetes.io/name: ${LOADER}-loader
        app.kubernetes.io/part-of: imdb
    spec:
      restartPolicy: Never
      containers:
        - name: loader
          image: imdb/loaders:local
          imagePullPolicy: IfNotPresent
          command: ["python3", "${PY_SCRIPT}"]
          args:
            - --db-host
            - postgres
            - --db-port
            - "5432"
            - --db-password
            - \$(POSTGRES_PASSWORD)
${USER_ARGS}          env:
            - name: PYTHONUNBUFFERED
              value: "1"
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-credentials
                  key: POSTGRES_PASSWORD
YAML

echo "Started Job $JOB. Waiting for its pod..."

pod_field() {
  kc -n "$K8S_NAMESPACE" get pods -l "job-name=$JOB" -o jsonpath="$1" 2>/dev/null
}

STARTED=false
for _ in $(seq 1 120); do
  case "$(pod_field '{.items[0].status.containerStatuses[0].state.waiting.reason}')" in
    ErrImageNeverPull|ErrImagePull|ImagePullBackOff|CreateContainerConfigError|InvalidImageName)
      break ;;
  esac
  case "$(pod_field '{.items[0].status.phase}')" in
    Running|Succeeded|Failed) STARTED=true; break ;;
  esac
  sleep 1
done

if [ "$STARTED" = true ]; then
  kc -n "$K8S_NAMESPACE" logs -f "job/$JOB"
fi

# logs -f returns when the container exits; give the Job controller a moment
# to record the outcome.
RESULT=""
for _ in $(seq 1 30); do
  [ "$(kc -n "$K8S_NAMESPACE" get job "$JOB" -o jsonpath='{.status.succeeded}' 2>/dev/null)" = "1" ] && RESULT=succeeded && break
  [ -n "$(kc -n "$K8S_NAMESPACE" get job "$JOB" -o jsonpath='{.status.failed}' 2>/dev/null)" ] && RESULT=failed && break
  [ "$STARTED" = false ] && RESULT=failed && break
  sleep 1
done

if [ "$RESULT" = "succeeded" ]; then
  kc -n "$K8S_NAMESPACE" delete job "$JOB" >/dev/null
  echo
  echo "Job $JOB succeeded (and was deleted)."
  exit 0
fi

echo >&2
echo "Job $JOB failed (or didn't finish). It's kept for inspection:" >&2
echo "  kubectl --context $K8S_CONTEXT describe job $JOB -n $K8S_NAMESPACE" >&2
echo "  kubectl --context $K8S_CONTEXT get pods -n $K8S_NAMESPACE -l job-name=$JOB" >&2
echo "  kubectl --context $K8S_CONTEXT logs job/$JOB -n $K8S_NAMESPACE" >&2
echo "It's removed automatically an hour after it finished, or by ./scripts/k8s-shutdown.sh." >&2
exit 1
