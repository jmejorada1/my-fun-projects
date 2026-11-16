# Verifying the local Kubernetes deployment, phase by phase

This guide checks the implementation of [spec.md](spec.md) in eight phases.
Each phase builds on the one before it, adds one layer, and ends with
concrete checks. If a phase fails, stop there: everything after it depends
on it. Test IDs (V1, S3, J2…) refer to the spec's
[test plan](spec.md#7-test-plan).

| Phase | Adds / proves | Spec tasks | Tests | Needs cluster | Time |
|---|---|---|---|---|---|
| [1. Static checks](#phase-1-static-checks-no-cluster) | Scripts parse, context guard holds, manifests render | T1, T7 | V1–V3, P4 | No | 2 min |
| [2. Cluster readiness](#phase-2-cluster-readiness) | Cluster reachable, local images visible, context guard | T1 | P3, P4, Q1 | Yes | 5–10 min |
| [3. Database layer](#phase-3-database-layer-envoy-gateway--postgres-alone) | Envoy Gateway installed, Postgres on its own PVC | T2 | partial S-pg | Yes | 5 min |
| [4. App and routing](#phase-4-app-and-routing) | posts + frontend behind the Gateway, one origin | T3–T5, T7, T8, T12 | V4, S1–S6, S-pg | Yes | 10 min |
| [5. Monitoring and port-forwards](#phase-5-monitoring-and-port-forwards) | Prometheus scrapes posts, Grafana provisioned | T6, T11 | M1, M2, PF1–PF3 | Yes | 5 min |
| [6. Data loaders](#phase-6-data-loaders) | Loaders as Jobs, seeded UI works end to end | T8, T9 | J1–J4, Manual | Yes | 10 min |
| [7. Day-2 operations](#phase-7-day-2-operations) | Reload, shutdown keeps data, `--all` wipes it | T10, T12 | RL1, SD1, SD2 | Yes | 15 min |
| [8. Coexistence and regression](#phase-8-coexistence-and-regression) | Compose unaffected, clear errors when both are up | T13 | P1, P2, G1–G3 | Yes | 10 min |

All commands run from the repo root. Every `kubectl` command names
`--context docker-desktop` explicitly, the same way the scripts do. To
shorten typing, you can define this alias for the session:

```bash
alias kc='kubectl --context docker-desktop'
```

The commands below spell the context out in full anyway, so they work
without the alias.

## Before you start

- Docker Desktop is running, with **Settings → Kubernetes** enabled and
  showing as running.
- Docker Desktop has at least 6 GB of memory (Settings → Resources).
- The compose stack is stopped: `./scripts/docker-shutdown.sh`.
- Optional: a `.env` (copy `.env.example`). The checks below use your
  `.env` values. Where a command shows a default (`4200`, `5433`,
  `P@55w0rd`), substitute yours if you changed it.

---

## Phase 1: Static checks (no cluster)

**Proves:** every script is valid bash, has `--help`, refuses to be
sourced, and the overlay renders with values from `.env`. No secrets or
`:latest` tags end up in the output. Docker and Kubernetes don't need to be
running.

One script runs every Phase 1 check:

```bash
./scripts/k8s-verify-static.sh; echo "exit=$?"
```

**Expect:** a ✓ on every line, then `All static checks passed`, and
`exit=0`. The exit code is the number of failed checks. It checks:

- **V1:** every k8s script and `lib-k8s.sh` passes `bash -n`.
  `shellcheck` also runs if it's installed (`brew install shellcheck`);
  otherwise you see a `!` line saying it was skipped.
- **P4 (context guard):** no script calls `kubectl` except through `kc()`,
  which pins `--context docker-desktop`. So no script can act on your
  *current* context, which might one day be a real EKS cluster. The only
  allowed exceptions don't touch a cluster: `kubectl kustomize`, read-only
  `kubectl config` queries, and hint text in messages. A failure lists the
  offending lines.
- **V2:** every script prints `--help` and refuses to be sourced, and
  `lib-k8s.sh` refuses to run directly.
- **V3:** the overlay renders all 19 expected objects (Namespace,
  Postgres, posts, frontend, Prometheus, Grafana, Gateway, HTTPRoute,
  GatewayClass, the 3 ConfigMaps). Also:
  - There's no Secret and no `:latest` image.
  - `imdb/posts:local` and `imdb/frontend:local` use
    `imagePullPolicy: IfNotPresent`.
  - The third-party images match the tags pinned in `docker-compose.yml`.
  - The GatewayClass has no namespace.
  - `FRONTEND_PORT` comes from `.env`. The script renders a second time
    with a different port (4300) and checks that both the Gateway listener
    and posts' CORS origin follow it. Your `.env` isn't touched.

To look at the rendered YAML yourself, run
`./scripts/k8s-run.sh --render | less`.

**If it fails:** the ✗ line says what's wrong. A render error names the
file and line. Always render through `./scripts/k8s-run.sh --render` or
this script, never with `kubectl kustomize` directly: only the scripts
write `.generated/` from `.env` first.

---

## Phase 2: Cluster readiness

**Proves:** the cluster is reachable. The cluster can also run a locally
built image without pulling from a registry. That's the spec's blocking
open question [Q1](spec.md#9-open-questions), and every later phase depends
on it. Last, the scripts ignore your *current* kubectl context.

```bash
kubectl config get-contexts                       # docker-desktop is listed
kubectl --context docker-desktop get nodes        # one or more nodes, STATUS Ready
./scripts/k8s-precheck.sh                         # every line ✓, exit 0
```

**The image-sharing probe (Q1).** The first run builds `imdb/posts:local`,
which takes a few minutes:

```bash
./scripts/k8s-precheck.sh --image-probe
```

**Expect:** `✓ cluster runs locally built images with no registry pull`.
The probe runs a pod with `imagePullPolicy: Never`, so it can only succeed
if the cluster sees Docker's local images.

**If the probe fails** (`ErrImageNeverPull`): **stop here.** The cluster
isn't sharing Docker's image store. In Docker Desktop's Kubernetes view,
check **Edit cluster**: it shows whether the cluster is *kubeadm* or
*kind*. Try the other mode, or turn on the containerd image store
(Settings → General), then rerun the probe. If neither works, the scripts
need an image-load step. Raise that as a follow-up to Q1.

**P4: the context guard, live (optional).** Phase 1's static check
already proves on every run that all kubectl calls go through `kc()`. This
is the same property shown against a real cluster. Point your current
context at a cluster that doesn't exist, and confirm the scripts still use
`docker-desktop`:

```bash
kubectl config set-context imdb-fake --cluster=does-not-exist --user=nobody
kubectl config use-context imdb-fake
kubectl get nodes                       # fails: plain kubectl now targets the fake context
./scripts/k8s-precheck.sh               # still passes: the scripts always use docker-desktop
kubectl config use-context docker-desktop
kubectl config delete-context imdb-fake
```

**P3: an unreachable cluster.** Optional. Turn off Kubernetes in Docker
Desktop (or quit Docker Desktop), then run `./scripts/k8s-precheck.sh`.
**Expect:** `✗ Kubernetes cluster 'docker-desktop' isn't reachable`, with
the "enable Kubernetes" hint, and exit 1. `./scripts/k8s-run.sh` refuses to
continue. Turn it back on before Phase 3.

---

## Phase 3: Database layer (Envoy Gateway + Postgres alone)

**Proves:** the cluster-wide Envoy Gateway installs from the pinned
release, and Postgres runs as a StatefulSet on its own persistent volume.
This phase builds those two layers by hand, so you can see what
`k8s-run.sh` automates. Phase 4 then runs the script over the top of them.

**3a. Install Envoy Gateway.** This is the same command `lib-k8s.sh` runs.
The version is `ENVOY_GATEWAY_VERSION` in `scripts/lib-k8s.sh`.

```bash
kubectl --context docker-desktop apply --server-side \
  -f https://github.com/envoyproxy/gateway/releases/download/v1.10.0/install.yaml
kubectl --context docker-desktop wait --timeout=5m -n envoy-gateway-system \
  deployment/envoy-gateway --for=condition=Available
kubectl --context docker-desktop get crd | grep gateway.networking.k8s.io   # gatewayclasses, gateways, httproutes, ...
kubectl --context docker-desktop get pods -n envoy-gateway-system           # envoy-gateway-... Running
```

**3b. Namespace and the Postgres Secret, from `.env`.** This mirrors
`ensure_namespace` and `ensure_secrets`. The password **must** match `.env`,
because Postgres stores it at first start:

```bash
set -a; [ -f .env ] && . ./.env; set +a
kubectl --context docker-desktop create namespace imdb --dry-run=client -o yaml | kubectl --context docker-desktop apply -f -
kubectl --context docker-desktop -n imdb create secret generic postgres-credentials \
  --from-literal=POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-P@55w0rd}" \
  --dry-run=client -o yaml | kubectl --context docker-desktop apply -f -
```

**3c. Apply only Postgres.** Render everything, then let `-l` filter it
down to the Postgres objects:

```bash
./scripts/k8s-run.sh --render > /tmp/imdb-rendered.yaml
kubectl --context docker-desktop apply -f /tmp/imdb-rendered.yaml -l app.kubernetes.io/name=postgres
kubectl --context docker-desktop rollout status statefulset/postgres -n imdb --timeout=3m
```

**Verify:**

```bash
kubectl --context docker-desktop get statefulset,pod,svc,pvc -n imdb
#   pod/postgres-0 1/1 Running · service/postgres ClusterIP 5432 · pvc/data-postgres-0 Bound 2Gi
kubectl --context docker-desktop exec -n imdb statefulset/postgres -- pg_isready -U postgres -d posts-db
#   accepting connections
kubectl --context docker-desktop exec -n imdb statefulset/postgres -- psql -U postgres -d posts-db -c 'select version()'
```

**Self-healing and persistence.** Write a row, kill the pod, and check the
row survives:

```bash
kubectl --context docker-desktop exec -n imdb statefulset/postgres -- psql -U postgres -d posts-db -c 'create table phase3_probe(x int); insert into phase3_probe values (42)'
kubectl --context docker-desktop delete pod postgres-0 -n imdb
kubectl --context docker-desktop rollout status statefulset/postgres -n imdb   # a new postgres-0 comes back
kubectl --context docker-desktop exec -n imdb statefulset/postgres -- psql -U postgres -d posts-db -c 'select * from phase3_probe; drop table phase3_probe'
#   42  (same PVC re-attached)
```

The table is created in the `public` schema, so it doesn't touch the
`posts` schema that Flyway owns.

---

## Phase 4: App and routing

**Proves:** posts and the frontend run, the Gateway serves both from one
origin, `/api` reaches posts, actuator isn't exposed, and the SPA fallback
works. `k8s-run.sh` now does the full flow. It finds Envoy Gateway and
Postgres already in place and leaves them alone.

```bash
./scripts/k8s-run.sh          # no seed flags yet; first build takes several minutes
```

**Expect:** precheck passes, then "Envoy Gateway already installed",
three image builds, rollout lines for each workload, and finally
`Stack is running on Kubernetes` with the URLs.

**V4: server-side validation against the live CRDs.**

```bash
./scripts/k8s-run.sh --render > /tmp/imdb-rendered.yaml
kubectl --context docker-desktop apply --dry-run=server -f /tmp/imdb-rendered.yaml
#   every object "... (server dry run)", no errors
```

**What's running:**

```bash
kubectl --context docker-desktop get pods,svc -n imdb             # postgres-0, posts, frontend, prometheus, grafana: all Running, READY 1/1
kubectl --context docker-desktop get gateway,httproute -n imdb    # gateway imdb PROGRAMMED=True
kubectl --context docker-desktop get svc -n envoy-gateway-system  # envoy-imdb-imdb-... LoadBalancer, EXTERNAL-IP localhost, PORT 4200
```

If `PROGRAMMED` is `False` or `EXTERNAL-IP` stays `<pending>`, Docker
Desktop isn't publishing LoadBalancer Services. Use
`./scripts/k8s-port-forward.sh gateway` in a second terminal for the rest
of the guide, and note it as a finding.

**S-pg: Flyway ran.**

```bash
kubectl --context docker-desktop exec -n imdb statefulset/postgres -- \
  psql -U postgres -d posts-db -c 'select count(*) from posts.flyway_schema_history'
#   > 0 (one row per migration, plus Flyway's schema-creation row)
```

**S1–S6: the smoke test.**

```bash
./scripts/k8s-smoke-test.sh; echo "exit=$?"     # all ✓, exit=0
```

S5 has two parts. `/api/actuator/health` must not return 200, because
actuator isn't on posts' main port. `/actuator/health` falls through to
the frontend rule, so nginx answers with the SPA's `index.html`. The check
there is that no actuator JSON comes back. (The spec's original wording,
"not 200" for both, was wrong for the second path. It's been corrected.)

**The smoke test catches a broken backend (T12).**

```bash
kubectl --context docker-desktop scale deployment/posts -n imdb --replicas=0
./scripts/k8s-smoke-test.sh; echo "exit=$?"     # S3 and S4 fail, exit=2
kubectl --context docker-desktop scale deployment/posts -n imdb --replicas=1
kubectl --context docker-desktop rollout status deployment/posts -n imdb --timeout=5m
./scripts/k8s-smoke-test.sh                     # back to all ✓
```

**Self-healing.** Delete the posts pod and watch the Deployment replace it:

```bash
kubectl --context docker-desktop delete pod -n imdb -l app.kubernetes.io/name=posts
kubectl --context docker-desktop get pods -n imdb -w      # new posts-... pod: Init → Running → 1/1 (Ctrl-C to stop watching)
```

**Hardening.** posts runs as non-root:

```bash
kubectl --context docker-desktop exec -n imdb deploy/posts -- id    # uid=1001(spring)
```

In a browser, `http://localhost:4200` loads the UI, and
`http://localhost:4200/api/swagger-ui.html` loads Swagger. There's no data
yet. Phase 6 seeds it.

---

## Phase 5: Monitoring and port-forwards

**Proves:** Prometheus scrapes posts' management port inside the cluster,
using compose's own `prometheus.yml`. Grafana comes up provisioned from
compose's files. Port-forwards expose Postgres, Prometheus and Grafana on
127.0.0.1 only.

In a **second terminal**:

```bash
./scripts/k8s-port-forward.sh          # all three; leave it running
```

**Expect:** three `Forwarding 127.0.0.1:<port> -> imdb/svc/<name>` lines,
then kubectl's own `Forwarding from 127.0.0.1:...` lines.

Back in the first terminal:

```bash
# M1: posts target is UP
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health, lastError}'
#   { "job": "posts", "health": "up", "lastError": "" }

# M2: Grafana. Log in with admin and your GRAFANA_ADMIN_PASSWORD (default: admin)
curl -s -u "admin:${GRAFANA_ADMIN_PASSWORD:-admin}" http://localhost:3000/api/datasources/uid/prometheus/health
#   {"message":"Successfully queried the Prometheus API.","status":"OK"}
curl -s -u "admin:${GRAFANA_ADMIN_PASSWORD:-admin}" 'http://localhost:3000/api/search?type=dash-db' | jq '.[].title'
#   "posts — JVM & HTTP overview"

# PF1: Postgres (needs psql locally, or point pgAdmin at localhost:5433)
PGPASSWORD="${POSTGRES_PASSWORD:-P@55w0rd}" psql -h localhost -p 5433 -U postgres -d posts-db -c 'select 1'

# Only bound to loopback:
lsof -nP -iTCP:5433 -sTCP:LISTEN     # 127.0.0.1:5433, not *:5433
```

In a browser, open <http://localhost:9090/targets> (posts is **UP**) and
<http://localhost:3000>. In Grafana, open the posts overview dashboard and
click around the UI on port 4200 for a minute: the panels fill with data.

**PF3: Ctrl-C closes everything.** Press Ctrl-C in the second terminal, then:

```bash
lsof -nP -iTCP:5433 -iTCP:9090 -iTCP:3000 -sTCP:LISTEN    # no output
```

One at a time works too: `./scripts/k8s-port-forward.sh grafana`.

**Config changes roll the pod (optional).** Change a comment in
`deploy/docker/prometheus/prometheus.yml`, then run `./scripts/k8s-run.sh`.
`kubectl --context docker-desktop get configmap -n imdb` now shows a new
`prometheus-config-<hash>`, and the prometheus pod was replaced. Revert the
comment afterwards.

---

## Phase 6: Data loaders

**Proves:** each loader runs as a one-shot Job that reads the DB password
from the Secret. Success deletes the Job, failure keeps it, and arguments
arrive verbatim. Then the seeded app works end to end in a browser.

**J1: seed both domains through `k8s-run.sh`.**

```bash
./scripts/k8s-run.sh --all
```

**Expect:** after the rollouts, "Seeding mock bigotry data...", the
loader's log streamed live, then `Job bigotry-loader-<n> succeeded (and was
deleted)`, and the same for standard.

```bash
kubectl --context docker-desktop exec -n imdb statefulset/postgres -- psql -U postgres -d posts-db -c \
  "select d.name, count(*) from posts.post p join posts.domain d on d.id = p.domain_id group by d.name"
#   imdb/bigotry and imdb/standard, both with non-zero counts
kubectl --context docker-desktop get jobs -n imdb     # none left over
```

**J2: a successful ad-hoc load is cleaned up.**

```bash
./scripts/k8s-load.sh imdb --domain imdb/standard --start-row 1 --end-row 100; echo "exit=$?"
#   exit=0, "succeeded (and was deleted)"
kubectl --context docker-desktop get jobs -n imdb     # still none
```

**J3: a failed load is kept for inspection.**

```bash
./scripts/k8s-load.sh bigotry --bogus-flag; echo "exit=$?"
#   argparse error in the streamed log ("unrecognized arguments: --bogus-flag"), exit=1
kubectl --context docker-desktop get jobs -n imdb     # bigotry-loader-<n>, COMPLETIONS 0/1, STATUS Failed
```

**J4: awkward arguments arrive verbatim.** This uses a path that doesn't
exist, so the Job fails and is kept, which lets you read back exactly what
it received:

```bash
./scripts/k8s-load.sh imdb --tsv-path "it's a \"test\" path with spaces"
JOB=$(kubectl --context docker-desktop get jobs -n imdb -l app.kubernetes.io/name=imdb-loader \
  --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1:].metadata.name}')
kubectl --context docker-desktop get job "$JOB" -n imdb -o jsonpath='{.spec.template.spec.containers[0].args}'; echo
#   [..., "--db-password", "$(POSTGRES_PASSWORD)", "--tsv-path", "it's a \"test\" path with spaces"]
```

The Pod spec shows the literal `$(POSTGRES_PASSWORD)`. Kubernetes expands
it only inside the container, so the password itself never appears in the
manifest.

Clean up the failed Jobs:

```bash
kubectl --context docker-desktop delete jobs -n imdb -l app.kubernetes.io/part-of=imdb
```

**Manual end-to-end check (browser).** Open `http://localhost:4200`, with
DevTools → Network open:

- [ ] Log in (dev user picker) and browse resources in **both** domains.
- [ ] Create a post and a reply. Flag a post (bigotry domain).
- [ ] Every API call goes to `http://localhost:4200/api/...` (same origin).
      There are no `OPTIONS` preflights and no CORS errors in the console.
- [ ] Refresh on a deep link (e.g. a resource page): the page loads,
      instead of returning a 404.

---

## Phase 7: Day-2 operations

**Proves:** `k8s-reload.sh` ships code changes, a plain shutdown keeps
data, and `--all` wipes it.

**RL1: frontend reload.** Change something visible, for example the
`<title>` in `frontend/imdb-ui-angular/src/index.html`, to
`ImdbUiAngular RL1`:

```bash
./scripts/k8s-reload.sh frontend
curl -s http://localhost:4200/ | grep -o '<title>.*</title>'     # <title>ImdbUiAngular RL1</title>
```

The browser tab title changes on a plain refresh. Revert the edit and run
`./scripts/k8s-reload.sh frontend` again.

**RL1: backend reload.** Add a temporary startup banner, so the new image
is obvious in the logs:

```bash
echo 'RL1 reload test' > backend/posts/src/main/resources/banner.txt
./scripts/k8s-reload.sh backend
kubectl --context docker-desktop logs -n imdb deploy/posts | head -3    # RL1 reload test
rm backend/posts/src/main/resources/banner.txt
./scripts/k8s-reload.sh backend
```

Both reloads happen without re-applying any manifests. `rollout restart`
starts new pods, and they pick up the rebuilt `:local` image.

**SD1: shutdown keeps the data.**

```bash
./scripts/k8s-shutdown.sh
kubectl --context docker-desktop get all -n imdb           # "No resources found" (pods may take a few seconds to terminate)
kubectl --context docker-desktop get pvc,secret -n imdb    # data-postgres-0, prometheus-data, grafana-data, both Secrets: still there
./scripts/k8s-run.sh
kubectl --context docker-desktop exec -n imdb statefulset/postgres -- psql -U postgres -d posts-db -c 'select count(*) from posts.post'
#   same non-zero count as after Phase 6
```

**SD2: `--all` wipes everything.**

```bash
./scripts/k8s-shutdown.sh --all
kubectl --context docker-desktop get namespace imdb        # NotFound
kubectl --context docker-desktop get gatewayclass imdb     # NotFound
./scripts/k8s-run.sh
kubectl --context docker-desktop exec -n imdb statefulset/postgres -- psql -U postgres -d posts-db -c 'select count(*) from posts.post'
#   0 (fresh DB: migrations only)
```

---

## Phase 8: Coexistence and regression

**Proves:** the compose stack works exactly as before, and each stack gives
a clear error if the other one is up.

**Compose blocked while k8s is up.** With the k8s stack still running from
Phase 7:

```bash
./scripts/docker-precheck.sh
#   ✗ port 4200 is already in use
#       Find what's using it: ... (if the k8s stack is up: ./scripts/k8s-shutdown.sh)
```

**G2 + P1: switch to compose, then k8s refuses.**

```bash
./scripts/k8s-shutdown.sh
./scripts/docker-run.sh --all            # compose comes up and seeds, exactly as before
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4200/                                   # 200
curl -s -H 'X-Domain: imdb/bigotry' http://localhost:8080/post-types | head -c 120; echo           # JSON array (no /api prefix in compose)
curl -s http://localhost:4200/config.json                                                         # {"apiBaseUrl": "http://localhost:8080"}
./scripts/k8s-precheck.sh; echo "exit=$?"
#   ✗ the docker compose stack is running → run ./scripts/docker-shutdown.sh first; exit=1
./scripts/docker-shutdown.sh
```

**P2: the port is held by something else, and no Gateway is deployed.**

```bash
python3 -m http.server 4200 &           # hold the port
./scripts/k8s-precheck.sh; echo "exit=$?"     # ✗ port 4200 is already in use, exit=1
kill %1
```

**G1: compose and the apps are untouched.**

```bash
git diff main --stat -- docker-compose.yml backend/ frontend/     # no output
diff <(git show main:docker-compose.yml) docker-compose.yml && echo "compose file identical"
```

The only edits to existing files are comment and doc text: one hint line
in `scripts/docker-precheck.sh`, a comment in `.env.example`, plus
`README.md`, `CLAUDE.md` and `.gitignore`.

**G3: the CI gates.**

```bash
./scripts/quality-gate.sh       # no app component touched, so the coverage gate is a no-op and passes
./scripts/security-scan.sh      # Semgrep + osv-scanner: no new findings
```

---

## When you're done

```bash
./scripts/k8s-shutdown.sh --all       # remove the app and its data
# Optional: remove Envoy Gateway from the cluster entirely
kubectl --context docker-desktop delete --ignore-not-found \
  -f https://github.com/envoyproxy/gateway/releases/download/v1.10.0/install.yaml
```

Record any phase that failed, with the command output, as a finding against
[spec.md](spec.md). If the Q1 probe or the LoadBalancer check failed,
update [Q1 in the open questions](spec.md#9-open-questions) with the
result.
