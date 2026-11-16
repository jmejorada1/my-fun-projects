# Local Kubernetes Deployment (with an EKS path)

**Source:** conversation request, 2026-11-03 (no requirements file)  ·  **Date:** 2026-11-03  ·  **Status:** Implemented 2026-11-16; cluster checks pending ([verification.md](verification.md))

## 1. Summary

Run the whole stack (Postgres, `posts`, frontend, Prometheus, Grafana, and
the data loaders) on the local Docker Desktop Kubernetes cluster. The
manifests are laid out as a Kustomize base plus a `local` overlay, so a later
`eks` overlay can reuse the same base. The browser reaches everything through
one origin, `http://localhost:${FRONTEND_PORT}`, via the Gateway API (Envoy
Gateway): the UI is served at `/` and the API at `/api`. No application code
changes. The docker-compose stack stays exactly as it is. Only one of the two
stacks runs at a time.

New to Kubernetes? [§11](#11-appendix-kubernetes-kinds-a-primer) explains
each kind of resource this spec uses and why.

### Decisions already made (by the user, 2026-11-03)

| Topic | Decision |
|---|---|
| Local cluster | Docker Desktop's built-in Kubernetes (`docker-desktop` context) |
| Manifest tooling | Kustomize (built into `kubectl`), base + overlays. Helm stays possible later; see [§8.1](#81-kustomize-now-helm-later) |
| Routing | Gateway API with **Envoy Gateway**. ingress-nginx was retired in March 2026 |
| Scope beyond posts/frontend/postgres | Data loaders as Jobs, Prometheus + Grafana, helper scripts |
| Coexistence with compose | **One at a time.** k8s takes `FRONTEND_PORT`, and the k8s scripts refuse to start while compose is running |
| Host access to Postgres/Prometheus/Grafana | On-demand `kubectl port-forward` on the existing `.env` ports |

## 2. Requirements Traceability

| ID | Requirement (paraphrased) | Covered by |
|---|---|---|
| R1 | Run frontend and backend (posts + Postgres) on local Kubernetes (Docker Desktop) | [§4.2](#42-manifests-base), T2–T4, T7 |
| R2 | Single-origin browser access: UI at `/`, API at `/api`, on `localhost:${FRONTEND_PORT}` | [§4.3](#43-routing-gateway-api--envoy-gateway), T5 |
| R3 | IMDB/bigotry/standard data loaders runnable as Kubernetes Jobs, including the seed flags on the run script | [§4.6](#46-data-loaders-as-jobs), T8, T9 |
| R4 | Prometheus + Grafana in-cluster, using the same config files as compose | [§4.5](#45-monitoring), T6 |
| R5 | Helper scripts that mirror `scripts/docker-*.sh` | [§4.7](#47-scripts), T1, T8–T12 |
| R6 | On-demand host access to Postgres, Prometheus, Grafana on the `.env` ports | [§4.7](#47-scripts), T11 |
| R7 | Ports and passwords come only from `.env` (repo rule), never hard-coded per file | [§4.4](#44-configuration-from-env), T1, T7, T8 |
| R8 | **No regressions:** compose stack, its scripts, CI gates and app behavior unchanged; clear errors if both stacks are started | [§4.8](#48-compatibility-with-the-compose-stack), T1, T13, [§7.4](#74-regression-checks) |
| R9 | Layout ready for AWS EKS; list the future EKS steps | [§4.1](#41-layout), [§10](#10-future-steps-deploying-to-aws-eks) |
| R10 | Docs updated (and the existing doc/code inconsistency fixed) | T13 |

## 3. Out of Scope

- Any EKS resources, an `overlays/eks` directory, IaC, or CI deploy jobs.
  These are listed in [§10](#10-future-steps-deploying-to-aws-eks), not built.
- Application code changes in `backend/posts`, `frontend/imdb-ui-angular` or
  `backend/imdb-data-python`. Everything here is driven by env vars the apps
  already honor.
- Changes to `docker-compose.yml` or the existing `scripts/docker-*.sh`
  behavior. T13 adds at most a one-line hint to `docker-precheck.sh`.
- Hot-reload dev loops (Tilt/Skaffold), multi-replica scaling, autoscaling,
  NetworkPolicies, TLS. These are EKS-time concerns ([§10](#10-future-steps-deploying-to-aws-eks)).
- Loading the full `title.basics.tsv` in k8s. Compose does this with an ad-hoc
  bind mount, which has no direct k8s equivalent. See [§9](#9-open-questions) Q5.

## 4. Design

### 4.1 Layout

```text
deploy/kubernetes/
  README.md                         # how to run, troubleshoot, uninstall
  base/
    kustomization.yaml              # namespace: imdb; labels part-of=imdb (includeSelectors: false)
    namespace.yaml
    postgres/   statefulset.yaml  service.yaml
    posts/      deployment.yaml   service.yaml
    frontend/   deployment.yaml   service.yaml
    gateway/    gateway.yaml      httproute.yaml
    monitoring/ prometheus.yaml   grafana.yaml   # Deployment + Service + PVC each
  overlays/
    local/
      kustomization.yaml            # images → :local tags, imagePullPolicy, configMapGenerators,
                                    # GatewayClass, and the generated .env patch
      gatewayclass.yaml             # GatewayClass "imdb" → Envoy Gateway controller
      .generated/                   # gitignored; written by scripts from .env
        env-patch.yaml
scripts/
  lib-k8s.sh                        # shared helpers (sourced, not run)
  k8s-precheck.sh  k8s-run.sh  k8s-reload.sh  k8s-load.sh
  k8s-port-forward.sh  k8s-shutdown.sh  k8s-smoke-test.sh
```

Everything environment-specific lives in the overlay: image names, pull
policy, which controller backs the GatewayClass, and ports. `base/` is what an
`overlays/eks` would reuse unchanged.

All resources carry `app.kubernetes.io/part-of: imdb` (Kustomize `labels:`
with `includeSelectors: false`, so selectors stay untouched). The scripts
use this label for selective deletes.

### 4.2 Manifests (base)

Namespace: `imdb`. One replica of everything. Images keep the same pins as
`docker-compose.yml` (`postgres:16-alpine`, `prom/prometheus:v3.14.0`,
`grafana/grafana:13.2.2`).

**Postgres** (`StatefulSet` + `ClusterIP` Service named `postgres`, port 5432)
- Env: `POSTGRES_DB=posts-db`, `POSTGRES_USER=postgres`,
  `POSTGRES_PASSWORD` from Secret `postgres-credentials`,
  `PGDATA=/var/lib/postgresql/data/pgdata`. The subdirectory avoids initdb
  failing on a non-empty mount root (`lost+found` on some volume types),
  which matters on EBS later.
- `volumeClaimTemplates`: 2Gi, default StorageClass (Docker Desktop's
  `hostpath`).
- Readiness/liveness: `exec pg_isready -U postgres -d posts-db`, the same
  command as the compose healthcheck.

**posts** (`Deployment` + `ClusterIP` Service `posts`, ports `http` 8080 and
`management` 8081)
- `initContainers: wait-for-postgres` (`postgres:16-alpine`, loops on
  `pg_isready -h postgres -p 5432`). This mirrors compose's
  `depends_on: condition: service_healthy` and avoids a CrashLoopBackOff on
  first start.
- Env (Spring relaxed binding, the same mechanism compose uses; no code or
  `application.yml` change):

  | Var | Value | Why |
  |---|---|---|
  | `SPRING_DATASOURCE_URL` | `jdbc:postgresql://postgres:5432/posts-db` | same as compose |
  | `SPRING_DATASOURCE_USERNAME` | `postgres` | same as compose |
  | `SPRING_DATASOURCE_PASSWORD` | from Secret `postgres-credentials` | same value as compose |
  | `SERVER_SERVLET_CONTEXTPATH` | `/api` | API is served under `/api`, so the route needs no rewrite ([§8.3](#83-api-prefix-context-path-vs-gateway-rewrite)) |
  | `APP_CORS_ALLOWED_ORIGINS` | `http://localhost:${FRONTEND_PORT}` (generated patch) | Same-origin in k8s, so CORS shouldn't trigger; set anyway so behavior matches if a request does |

- Probes on the **management port 8081**, which `server.servlet.context-path`
  doesn't affect because it's a separate management server. Startup, liveness
  and readiness probes are already enabled in `application.yml`:
  - `startupProbe`: `GET :8081/actuator/health/liveness`, period 5s,
    failureThreshold 36 (3 min for JVM start + Flyway).
  - `livenessProbe`: `GET :8081/actuator/health/liveness`.
  - `readinessProbe`: `GET :8081/actuator/health/readiness`.
- Readiness implies Flyway has finished (migrations run before the context
  is ready). So `kubectl rollout status deploy/posts` replaces compose's
  `docker-wait-for-posts.sh` psql polling.
- `securityContext`: `runAsNonRoot: true`, `runAsUser: 1001` (the image's
  `spring` user), `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`.
- Resources (starting points, tune after T3): requests 250m/512Mi,
  limit 1Gi memory.

**frontend** (`Deployment` + `ClusterIP` Service `frontend`, port 80)
- Env `API_BASE_URL=/api`. `docker-entrypoint.sh` writes it to
  `/config.json`, and every `api/*.service.ts` builds URLs as
  `` `${baseUrl}/...` ``, so a relative `/api` works with no frontend change.
  Verified: no `new URL(...)` or prefix checks in `src/app`.
- Probes: `GET :80/`.
- No `runAsNonRoot`: `nginx:1.27-alpine`'s master process starts as root.
  Changing that means changing the image, which is out of scope here and
  listed in [§10](#10-future-steps-deploying-to-aws-eks) step 8.
- Resources: requests 50m/32Mi, limit 128Mi.

### 4.3 Routing: Gateway API + Envoy Gateway

Envoy Gateway is cluster-wide infrastructure. It is installed **once** by
`lib-k8s.sh` from a **pinned** release manifest (no Helm needed):

```bash
kubectl apply --server-side -f \
  "https://github.com/envoyproxy/gateway/releases/download/${ENVOY_GATEWAY_VERSION}/install.yaml"
kubectl wait --timeout=5m -n envoy-gateway-system deployment/envoy-gateway --for=condition=Available
```

`ENVOY_GATEWAY_VERSION` is a constant in `scripts/lib-k8s.sh`. The
implementer sets it to the newest **stable** (non-pre-release) tag on
<https://github.com/envoyproxy/gateway/releases> **that ships an
`install.yaml` asset**, and records the date checked in a comment. That
`install.yaml` also installs the Gateway API CRDs.

`overlays/local/gatewayclass.yaml`:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: imdb
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
```

`base/gateway/gateway.yaml` and `httproute.yaml`:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: imdb
spec:
  gatewayClassName: imdb            # each overlay defines GatewayClass "imdb"
  listeners:
    - name: http
      protocol: HTTP
      port: 4200                    # replaced from .env FRONTEND_PORT (generated patch)
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: imdb
spec:
  parentRefs: [{ name: imdb }]
  rules:
    - matches: [{ path: { type: PathPrefix, value: /api } }]
      backendRefs: [{ name: posts, port: 8080 }]
    - matches: [{ path: { type: PathPrefix, value: / } }]
      backendRefs: [{ name: frontend, port: 80 }]
```

- Envoy Gateway exposes the Gateway through a `LoadBalancer` Service whose
  port is the listener port. Docker Desktop publishes `LoadBalancer`
  Services on `localhost`, so the app is at `http://localhost:${FRONTEND_PORT}`,
  the same URL as with compose. T5 verifies this.
- **Management port 8081 is never routed.** Only `posts:8080` is a backend.
  This mirrors compose, where 8081 isn't published.
- Gateway API `PathPrefix` matches whole path segments, so `/api` matches
  `/api` and `/api/...` but not `/apix`. No Angular route starts with `/api`.
- On EKS the base stays the same and only the GatewayClass changes
  (`controllerName: gateway.k8s.aws/alb`, AWS Load Balancer Controller).

### 4.4 Configuration from `.env`

The repo rule is that ports live only in `.env`. Kustomize can't read env
vars, so `lib-k8s.sh` (function `write_env_patch`) loads `.env` the same way
`docker-run.sh` does (falling back to the compose defaults). It then writes
`overlays/local/.generated/env-patch.yaml` before every render. That patch
is a JSON6902 patch for the Gateway listener port plus a strategic-merge
patch for posts' `APP_CORS_ALLOWED_ORIGINS`. The directory is gitignored.

| `.env` var | Used by k8s for |
|---|---|
| `FRONTEND_PORT` | Gateway listener (the single origin) and the CORS origin |
| `API_PORT` | **Unused in k8s.** The API lives at `${FRONTEND_PORT}/api`. Noted in `.env.example` (T13) |
| `POSTGRES_PORT`, `PROMETHEUS_PORT`, `GRAFANA_PORT` | `k8s-port-forward.sh` local ports |
| `POSTGRES_PASSWORD` | Secret `postgres-credentials` |
| `GRAFANA_ADMIN_PASSWORD` | Secret `grafana-admin` |

Secrets are created by the scripts, never committed and never rendered by
Kustomize:
`kubectl create secret generic … --from-literal=… --dry-run=client -o yaml | kubectl apply -f -`.
As with compose, Postgres reads `POSTGRES_PASSWORD` only at first initdb, so
changing it later needs `k8s-shutdown.sh --all`. The README calls this out.

**Rendering:** the overlay's `configMapGenerator`s read the existing files
under `deploy/docker/` ([§4.5](#45-monitoring)), which sit outside the
kustomization root. The scripts therefore render with
`kubectl kustomize --load-restrictor LoadRestrictionsNone deploy/kubernetes/overlays/local | kubectl apply -f -`
rather than `kubectl apply -k`. The flag was checked against the installed
kubectl (v1.36.1). The README tells people to deploy through the scripts.

### 4.5 Monitoring

To avoid config drift, the overlay reuses compose's files instead of copying them:

| ConfigMap (generator) | Source file(s) | Mounted at |
|---|---|---|
| `prometheus-config` | `deploy/docker/prometheus/prometheus.yml` | `/etc/prometheus/prometheus.yml` |
| `grafana-datasources` | `deploy/docker/grafana/provisioning/datasources/datasource.yml` | `/etc/grafana/provisioning/datasources/` |
| `grafana-dashboards` | `deploy/docker/grafana/provisioning/dashboards/{dashboards.yml,posts-overview.json}` | `/etc/grafana/provisioning/dashboards/` (the path `dashboards.yml` already points at) |

These work unchanged because the in-cluster Service names match the compose
service names. `prometheus.yml` targets `posts:8081` and `datasource.yml`
targets `http://prometheus:9090`. Generated ConfigMap names include a content
hash, so editing a file rolls the pod on the next `k8s-run.sh`.

- Prometheus: same args as compose (`--config.file=…`,
  `--storage.tsdb.retention.time=15d`). PVC 2Gi at `/prometheus`,
  `fsGroup: 65534`. `ClusterIP` Service `prometheus:9090`.
- Grafana: `GF_SECURITY_ADMIN_USER=admin`, `GF_SECURITY_ADMIN_PASSWORD` from
  Secret `grafana-admin`, `GF_USERS_ALLOW_SIGN_UP=false`. PVC 1Gi at
  `/var/lib/grafana`, `fsGroup: 472`. `ClusterIP` Service `grafana:3000`.
- Neither is routed through the Gateway. They're reached via
  `k8s-port-forward.sh` ([§4.7](#47-scripts)).

### 4.6 Data loaders as Jobs

One image, `imdb/loaders:local`, built from `backend/imdb-data-python`.
`k8s-load.sh <imdb|bigotry|standard> [loader args...]` writes a Job
manifest with a bash heredoc and applies it:

- Name `<loader>-<unix-seconds>`, `backoffLimit: 0`,
  `restartPolicy: Never`, `ttlSecondsAfterFinished: 3600`. This mirrors
  `docker compose run --rm`: one attempt, no retries.
- `command`, matching compose's per-service entrypoints:
  - `imdb` → `python3 import_resources.py`
  - `bigotry` → `python3 import_bigotry_data.py`
  - `standard` → `python3 import_standard_data.py`
- `args`: `--db-host postgres --db-port 5432 --db-password $(POSTGRES_PASSWORD)`,
  then the user's args. Each user arg is written as a YAML single-quoted
  scalar with embedded `'` doubled, so arbitrary text can't break the
  manifest. `POSTGRES_PASSWORD` comes from Secret `postgres-credentials`
  via `env.valueFrom`, and Kubernetes expands `$(VAR)` in `args`. All three
  scripts accept `--db-password`, and CLI flags override `config.yaml`.
- The script streams the pod's logs and exits non-zero if the Job fails. It
  deletes the Job on success and keeps it on failure so it can be inspected.
- `k8s-run.sh bigotry-data | standard-data | --all` calls `k8s-load.sh`
  after the rollout finishes, matching `docker-run.sh`'s flags.

> Pre-existing compose gap (not fixed here): compose's loader services never
> pass `POSTGRES_PASSWORD`, so they rely on `config.yaml`'s hard-coded
> `P@55w0rd`. A non-default `.env` password breaks compose seeding. The k8s
> Jobs avoid this. See [§9](#9-open-questions) Q4.

### 4.7 Scripts

Every script follows the existing `docker-*.sh` conventions: the
refuse-to-be-sourced guard, `set -uo pipefail`, `cd` to the repo root,
`.env` loading, and `-h/--help`. Shared logic goes in
`scripts/lib-k8s.sh`, which five scripts use, so it passes the rule of three.

**Context guard (safety):** `lib-k8s.sh` defines
`K8S_CONTEXT=docker-desktop` and a `kc()` wrapper that always runs
`kubectl --context "$K8S_CONTEXT" …`. The scripts never use the
*current* kubectl context. Once an EKS context exists on this machine, a
local script can't apply to, or delete from, the remote cluster.

| Script | Behavior |
|---|---|
| `k8s-precheck.sh` | ✓ `kubectl` installed. ✓ Docker daemon up. ✓ `docker-desktop` context exists and `kc get nodes` succeeds (otherwise: "enable Kubernetes in Docker Desktop → Settings → Kubernetes"). ✓ compose stack **not** running (`docker compose ps -q` empty), otherwise fail with "run ./scripts/docker-shutdown.sh first". ✓ If the `imdb` Gateway isn't deployed yet, `FRONTEND_PORT` is free. Same pass/fail/warn output style as `docker-precheck.sh` |
| `k8s-run.sh [bigotry-data] [standard-data] [--all]` | precheck → install Envoy Gateway if missing → `docker build` the three images as `imdb/{posts,frontend,loaders}:local` → ensure namespace and Secrets → `write_env_patch` → render + apply → `kubectl wait` Gateway `Programmed` → `rollout status` for postgres, posts, frontend, prometheus, grafana (5 min timeout) → optional seeding → print URLs (app, `/api/swagger-ui.html`, port-forward hint, stop command). Stops with a clear message on any failure |
| `k8s-reload.sh [frontend\|backend]` | rebuild the image(s), then `kc rollout restart` + `rollout status`. No precheck, same as `docker-reload.sh` |
| `k8s-load.sh <imdb\|bigotry\|standard> [args…]` | see [§4.6](#46-data-loaders-as-jobs) |
| `k8s-port-forward.sh [postgres\|prometheus\|grafana\|all]` | foreground `kc port-forward svc/<x> <.env port>:<svc port>` (127.0.0.1 only). `all` runs the three together, with a `trap` that kills them all on Ctrl-C. Default is `all` |
| `k8s-shutdown.sh [--all]` | default: `kc delete -n imdb deployment,statefulset,service,configmap,job,httproute,gateway -l app.kubernetes.io/part-of=imdb`, which **keeps PVCs and Secrets** (like `docker compose down` keeping volumes). `--all`: also delete namespace `imdb` (all data) and GatewayClass `imdb`. Envoy Gateway itself stays installed; the uninstall command is in the README |
| `k8s-smoke-test.sh [base-url]` | curl checks S1–S6 from [§7.2](#72-smoke-checks-k8s-smoke-testsh) against `http://localhost:${FRONTEND_PORT}` by default. Exit code = number of failures. Takes a URL so it can be reused against EKS later |

Image tags are `:local`, not `:latest`, with `imagePullPolicy: IfNotPresent`
set in the overlay. `:latest` would default to `Always` and try a registry
pull. `k8s-reload.sh` relies on `rollout restart` picking up the rebuilt
`:local` tag from the node's image store. T1 verifies this.

### 4.8 Compatibility with the compose stack

- `docker-compose.yml`, `scripts/docker-*.sh` and all application code are
  **unchanged**. The k8s images use their own names
  (`imdb/*:local`), so they never overwrite compose's images.
- Both stacks claim `FRONTEND_PORT`. `k8s-precheck.sh` refuses while compose
  runs. `docker-precheck.sh` already fails on a busy port, and T13 adds one
  hint line pointing to `./scripts/k8s-shutdown.sh`.
- The data is separate. k8s Postgres lives in a PVC, compose's in the
  `postgres-data` volume. Each stack must be seeded on its own.
- CI: `scripts/quality-gate.sh` maps changes to components by path
  (`lib-tools.sh: touched_components`), and `deploy/`, `scripts/` and `docs/`
  aren't components, so the coverage gate is a no-op for this change.
  `security-scan.sh` still runs. Whether to add manifest validation is
  [§9](#9-open-questions) Q3.

## 5. Security Considerations

- **Secrets:** come from `.env` (gitignored) and are created imperatively.
  None are in git or in rendered output. Defaults match compose's local-only
  defaults. Kubernetes Secrets are only base64 in the local etcd, which is
  fine for a local cluster but not for EKS ([§10](#10-future-steps-deploying-to-aws-eks) step 4).
- **Exposure parity with compose:** only the Gateway is published. Postgres,
  Prometheus and Grafana are reachable only through an explicit
  port-forward bound to 127.0.0.1, which is tighter than compose (it
  publishes them on all interfaces). Actuator (8081) is never routed, same
  as compose.
- **Wrong-cluster protection:** the `kc()` context guard ([§4.7](#47-scripts)).
- **Supply chain:** Envoy Gateway's `install.yaml` is fetched from a pinned
  GitHub release tag, never `latest`. Third-party image tags are pinned,
  matching compose.
- **Loader password:** passed as a CLI arg via `$(POSTGRES_PASSWORD)`
  expansion. The Pod spec shows only the literal `$(POSTGRES_PASSWORD)`, but
  the expanded value is visible in the process list inside the loader pod.
  That's acceptable locally. For EKS, make the loaders read an env var
  ([§10](#10-future-steps-deploying-to-aws-eks) step 9).
- **App auth is still a placeholder:** `SecurityConfig` is `permitAll` and
  `/dev/users` exists. That's harmless on localhost, but it's the
  **#1 blocker** for any internet-facing EKS deployment ([§10](#10-future-steps-deploying-to-aws-eks) step 8).
- Pod hardening: posts runs non-root with all capabilities dropped. The
  frontend can't until it moves to an unprivileged nginx image
  ([§4.2](#42-manifests-base)).

## 6. Implementation Tasks

There are no unit-testable code paths here (YAML and shell only). Each
task's "tests" are the static and smoke checks in [§7](#7-test-plan), which
the implementer runs and pastes the output of.

- [ ] **T1** — `scripts/lib-k8s.sh`, `scripts/k8s-precheck.sh`, `.gitignore` (`deploy/kubernetes/overlays/local/.generated/`)
  — context guard `kc()`, `.env` loading with compose defaults, `write_env_patch`,
  `ensure_envoy_gateway` (pinned version), `render_local`; precheck as in [§4.7](#47-scripts).
  **First, verify image sharing:** build `imdb/posts:local`, run a throwaway
  pod with `imagePullPolicy: IfNotPresent`, and confirm it starts with no
  pull. If it fails, stop and raise [§9](#9-open-questions) Q1.
  — R5, R7, R8 — tests: V1, V2, P1–P4
- [ ] **T2** — `deploy/kubernetes/base/{kustomization,namespace}.yaml`, `base/postgres/*` — R1 — tests: V3, S-pg
- [ ] **T3** — `base/posts/*` — init container, env, probes on 8081, securityContext — R1 — tests: V3, S3, S5
- [ ] **T4** — `base/frontend/*` — `API_BASE_URL=/api` — R1 — tests: S1, S2, S6
- [ ] **T5** — `base/gateway/*`, `overlays/local/gatewayclass.yaml` — R2 — tests: S1–S6, confirm `localhost:${FRONTEND_PORT}` is served by the Gateway LB
- [ ] **T6** — `base/monitoring/*` + overlay `configMapGenerator`s pointing at `deploy/docker/...` — R4 — tests: M1, M2
- [ ] **T7** — `overlays/local/kustomization.yaml` — `images:` → `imdb/*:local`, `imagePullPolicy: IfNotPresent` patch, generated patch wiring — R1, R7 — tests: V3, V4
- [ ] **T8** — `scripts/k8s-run.sh` — full flow + seed flags — R3, R5 — tests: full [§7.2](#72-smoke-checks-k8s-smoke-testsh) run from a clean cluster, J1
- [ ] **T9** — `scripts/k8s-load.sh` — R3 — tests: J1–J4
- [ ] **T10** — `scripts/k8s-reload.sh` — R5 — tests: RL1
- [ ] **T11** — `scripts/k8s-port-forward.sh` — R6 — tests: PF1–PF3
- [ ] **T12** — `scripts/k8s-shutdown.sh`, `scripts/k8s-smoke-test.sh` — R5 — tests: SD1, SD2, smoke script exit 0 on a healthy stack, non-zero with posts scaled to 0
- [ ] **T13** — docs — R8, R10:
  - `deploy/kubernetes/README.md`: prerequisites (Docker Desktop → Settings → Kubernetes enabled; enough memory, see [§9](#9-open-questions) Q2), quick start, script table, troubleshooting (`kc get pods -n imdb`, `ErrImageNeverPull`/`ImagePullBackOff`, port busy), Envoy Gateway uninstall command, password-change caveat.
  - `README.md`: short "Running on Kubernetes (local)" section linking to it.
  - Root `CLAUDE.md`: fix the inconsistency (it says `deploy/kubernetes/` is an empty placeholder and that `deploy/docker/requirements.txt` exists; **neither is true today**). Add the k8s scripts to "Running the stack". Add a line in "Components" or "Running the stack" pointing to `deploy/kubernetes/README.md`.
  - `.env.example`: note that `API_PORT` is unused in k8s.
  - `scripts/docker-precheck.sh`: one hint line on port-busy failures ("if the k8s stack is up: ./scripts/k8s-shutdown.sh"). Message text only.
  — tests: G1–G3 ([§7.4](#74-regression-checks))

## 7. Test Plan

None of these checks use Testcontainers. All of them need Docker Desktop
running with Kubernetes enabled, except V1 and V2.

### 7.1 Static checks

| ID | Check |
|---|---|
| V1 | `bash -n` on every new script. `shellcheck` too, if it's installed (it isn't today; see [§8.7](#87-ci-validation-of-manifests)) |
| V2 | Every script refuses to be sourced and prints `--help` |
| V3 | `kubectl kustomize --load-restrictor LoadRestrictionsNone deploy/kubernetes/overlays/local` renders cleanly. Output contains no Secret, no `:latest` images, and no hard-coded `4200` once `.env` sets a different `FRONTEND_PORT` |
| V4 | `kc apply --dry-run=server -f <rendered>` succeeds (validates against the live CRDs) |

### 7.2 Smoke checks (`k8s-smoke-test.sh`)

| ID | Check |
|---|---|
| S1 | `GET /` → 200, `text/html` |
| S2 | `GET /config.json` → `{"apiBaseUrl": "/api"}` |
| S3 | `GET /api/post-types` with `X-Domain: imdb/bigotry` → 200 JSON array |
| S4 | `GET /api/swagger-ui.html` → 200 (after redirects) |
| S5 | `GET /api/actuator/health` → **not** 200, and `GET /actuator/health` → **no actuator JSON** (management is not routed). The second path falls through to the `/` rule, so nginx answers with `index.html` (a 200). See [§12](#12-implementation-notes) |
| S6 | `GET /some/deep/angular/route` → 200 `index.html` (nginx `try_files` fallback through the Gateway) |
| S-pg | `kc exec -n imdb statefulset/postgres -- psql -U postgres -d posts-db -c 'select count(*) from posts.flyway_schema_history'` > 0 |
| Manual | In a browser: log in, browse resources for both domains, create a post and a reply, flag a post. DevTools shows every API call going to same-origin `/api/...` with no CORS preflight errors |

### 7.3 Other functional checks

| ID | Check |
|---|---|
| P1 | Precheck fails while compose is up (`./scripts/docker-run.sh -d`, then `k8s-precheck.sh`) |
| P2 | Precheck fails when another process holds `FRONTEND_PORT` and the Gateway isn't deployed |
| P3 | Precheck fails clearly when the Kubernetes context is unreachable |
| P4 | With the *current* kubectl context switched to something else, scripts still target `docker-desktop` only |
| M1 | `k8s-port-forward.sh prometheus` → <http://localhost:9090/targets> shows `posts` **UP** |
| M2 | `k8s-port-forward.sh grafana` → login with `.env` password, Prometheus datasource healthy, "posts overview" dashboard shows data |
| J1 | `k8s-run.sh --all` seeds both domains. UI shows bigotry and standard data |
| J2 | `k8s-load.sh imdb --domain imdb/standard --start-row 1 --end-row 100` succeeds. The Job is deleted afterward |
| J3 | `k8s-load.sh bigotry --bogus-flag` fails with non-zero exit. The Job is kept for inspection |
| J4 | An arg containing `'` and spaces reaches the loader verbatim (check `kc get job -o yaml`) |
| RL1 | Change a visible frontend string → `k8s-reload.sh frontend` → the change shows on refresh, with no reapply. Same for `backend` |
| PF1–PF3 | psql/pgAdmin on `localhost:${POSTGRES_PORT}`, Prometheus on `${PROMETHEUS_PORT}`, Grafana on `${GRAFANA_PORT}`. Ctrl-C on `all` kills every forward |
| SD1 | `k8s-shutdown.sh` then `k8s-run.sh` → seeded data still present |
| SD2 | `k8s-shutdown.sh --all` then `k8s-run.sh` → empty DB (migrations only) |

### 7.4 Regression checks

| ID | Check |
|---|---|
| G1 | `git diff main -- docker-compose.yml backend/ frontend/` is empty. `docker compose config` output is identical before and after |
| G2 | After `k8s-shutdown.sh`, `./scripts/docker-run.sh --all` works and the compose app behaves as before (S1-equivalent checks against compose's URLs) |
| G3 | `./scripts/quality-gate.sh` and `./scripts/security-scan.sh` pass on the branch |

## 8. Alternatives & Recommendations

### 8.1 Kustomize now, Helm later
Kustomize files are plain Kubernetes YAML. Moving to Helm later means moving
`base/` into a chart's `templates/` and turning each overlay's patches into a
`values-<env>.yaml`. Helm can also run Kustomize as a post-renderer during a
transition. **Recommendation: Kustomize (decided).** Third-party components
on EKS (e.g. AWS Load Balancer Controller, External Secrets) are usually
installed via Helm anyway, and that doesn't conflict with this layout.

### 8.2 Ingress controller
ingress-nginx was retired in March 2026 (no fixes after that). Traefik works
but is usually Helm-installed. **Recommendation: Gateway API + Envoy Gateway
(decided).** It installs with plain kubectl from a pinned manifest, and the
same `Gateway`/`HTTPRoute` move to EKS, where only the GatewayClass changes
(AWS Load Balancer Controller supports the Gateway API at GA).

### 8.3 API prefix: context path vs Gateway rewrite
- (a) **posts serves under `/api`** via `SERVER_SERVLET_CONTEXTPATH`
  (k8s env only): no rewrite filter is needed, Swagger and redirects get
  correct URLs on their own, and actuator on 8081 is unaffected.
- (b) Route `/api` with a `URLRewrite` `ReplacePrefixMatch: /` filter: posts
  stays at `/`, but Swagger UI generates wrong links unless it also gets
  `X-Forwarded-Prefix` plus `server.forward-headers-strategy=framework`.

**Recommendation: (a).** It's simpler and has fewer moving parts. Its only
cost is that k8s and compose serve the API at different paths, which is
invisible to the frontend because `API_BASE_URL` differs too.

### 8.4 Reusing compose's monitoring config
Options: render with `--load-restrictor LoadRestrictionsNone` (chosen), copy
the files into `deploy/kubernetes` (drift risk), or move them to a shared
directory and update compose's mount paths (touches compose).
**Recommendation: load-restrictor flag.** The only cost is that people must
deploy via the scripts, not `kubectl apply -k`.

### 8.5 Loader Jobs
Options: a script-generated Job manifest (chosen), `kubectl create job`
(can't add the Secret-backed env var), or static Job manifests in Kustomize
(can't take per-run args without templating).
**Recommendation: script-generated manifest.**

### 8.6 Dev-loop tooling (Tilt/Skaffold)
They'd give file-watch rebuilds, but they're new tools and `k8s-reload.sh`
already covers the need. **Recommendation: not now.** Revisit if reloads
become frequent.

### 8.7 CI validation of manifests
**Recommendation:** add a small CI job, separate from this change, that
renders the overlay with `kubectl kustomize` and validates it with
`kubeconform` (Gateway API CRD schemas included). Also consider
`shellcheck` for `scripts/*.sh`. See [§9](#9-open-questions) Q3.

## 9. Open Questions

| # | Question | Blocking? | Default if unanswered |
|---|---|---|---|
| Q1 | Which provisioning mode does Docker Desktop → Settings → Kubernetes use, **kubeadm** or **kind**? This spec assumes locally built images are visible to the cluster with no registry or load step, which T1 verifies. If they aren't, the scripts need a load step or a local registry | **BLOCKING before T1** (check the setting, or let T1's probe answer it) | kubeadm; T1 stops if the probe pod can't start |
| Q2 | How much memory is Docker Desktop allowed? The k8s stack adds Envoy Gateway, the Envoy proxy and kube-system pods on top of the compose footprint | NON-BLOCKING | README recommends ≥ 6 GB; adjust after measuring in T8 |
| Q3 | Add a manifest-validation CI job ([§8.7](#87-ci-validation-of-manifests)) in this change, or as a follow-up? | NON-BLOCKING | Follow-up |
| Q4 | Fix compose's loaders ignoring `POSTGRES_PASSWORD` ([§4.6](#46-data-loaders-as-jobs)) here, or separately? | NON-BLOCKING | Separately (this change doesn't touch compose) |
| Q5 | Is loading the full `title.basics.tsv` in k8s needed? Options: a `hostPath` mount (Docker Desktop only), copying it into a PVC, or baking a separate image | NON-BLOCKING | Not supported; bundled sample only, as compose's default |
| Q6 | Namespace name `imdb` and image names `imdb/*:local` OK? | NON-BLOCKING | Yes |

## 10. Future Steps: Deploying to AWS EKS

Ordered roughly by dependency. Each step lists the decision it needs, with a
recommendation. None of this is built by this spec.

1. **Decide how to provision infrastructure.** Terraform (with the
   community `terraform-aws-modules/eks` module) vs `eksctl` vs AWS CDK.
   *Recommendation:* Terraform. ECR, RDS, IAM, ACM and Route 53 are needed
   alongside the cluster, and Terraform manages them all in one place.
   `eksctl` is faster for a throwaway first cluster. Also evaluate EKS Auto
   Mode (AWS-managed nodes and add-ons). Verify its Gateway API support
   before choosing it.
2. **Container registry.** ECR repositories for `posts`, `frontend` and
   `loaders`, with immutable tags (git SHA). GitHub Actions builds and
   pushes via OIDC to an IAM role (no long-lived keys). Build `linux/amd64`
   and/or `arm64` to match the node type (Graviton is cheaper; this Mac is
   x86_64).
3. **Database.** *Recommendation:* Amazon RDS for PostgreSQL 16 (backups,
   patching, Multi-AZ), and drop the Postgres StatefulSet from
   `overlays/eks`. The in-cluster alternative needs the EBS CSI driver, a
   `gp3` StorageClass, and your own backups. Point
   `SPRING_DATASOURCE_URL` at the RDS endpoint with `sslmode=require`.
   Flyway still runs on posts startup. It takes a Postgres lock, so multiple
   replicas starting at once is safe.
4. **Secrets.** AWS Secrets Manager (RDS can manage its master secret) synced
   into the cluster by External Secrets Operator or the Secrets Store CSI
   driver, using EKS Pod Identity (or IRSA). Replaces the scripts'
   `kubectl create secret`.
5. **Ingress, TLS and DNS.** Install the AWS Load Balancer Controller.
   `overlays/eks/gatewayclass.yaml` sets
   `controllerName: gateway.k8s.aws/alb`. Add an HTTPS listener with an ACM
   certificate, redirect HTTP to HTTPS, and add a Route 53 record (manually
   or via ExternalDNS). Set `APP_CORS_ALLOWED_ORIGINS=https://<domain>` and
   `SERVER_FORWARDHEADERSSTRATEGY=framework` on posts, so Spring honors the
   ALB's `X-Forwarded-Proto` (correct `https` links in Swagger and redirects).
6. **`overlays/eks`.** Images point at ECR. Add replicas ≥ 2 for posts and
   frontend, `PodDisruptionBudget`s, topology spread across AZs,
   resource requests sized from local measurements, and optionally an HPA
   on posts. Confirm posts is stateless before scaling it (no in-memory
   session or cache state).
7. **Observability.** Replace the static `posts:8081` scrape target, which
   only hits one replica behind a Service. Use Kubernetes service discovery,
   or a `ServiceMonitor` via kube-prometheus-stack, or Amazon Managed
   Service for Prometheus + Amazon Managed Grafana. The existing
   `posts-overview.json` dashboard can be imported. Send logs to CloudWatch
   (Container Insights or Fluent Bit).
8. **Security hardening (before anything is internet-facing).**
   - **Real authentication.** Replace `SecurityConfig`'s `permitAll`, the
     `X-User-Id` header and the `/dev/users` endpoints with IdP-backed auth
     (e.g. Cognito or another OIDC provider). This is already on `TODO.txt`
     and is the **#1 blocker**. Revisit `SECURITY-CONSIDERATIONS.md`'s
     hardening list at the same time.
   - NetworkPolicies (VPC CNI supports them). Default-deny, allow
     gateway→frontend/posts:8080, allow prometheus→posts:8081 only, and
     allow posts→RDS.
   - Label the namespace with Pod Security Standards `restricted`. Move the
     frontend to an unprivileged nginx image (non-root, listening on 8080)
     and set `readOnlyRootFilesystem` where possible.
   - Turn off Swagger UI in production, or put it behind auth.
9. **Data loaders on EKS.** Run the same Jobs (`k8s-load.sh` with the
   `eks` context and ECR image) against RDS. Change the loaders to read the
   DB password from an env var instead of a CLI flag (a small code change
   with tests). For the full IMDB dataset, read `title.basics.tsv` from S3
   (Pod Identity grants read access) instead of a bind mount.
10. **CI/CD.** A GitHub Actions workflow builds and pushes images, renders
    `overlays/eks` with the new tag, and applies it. Gate it on the existing
    quality and security workflow. Consider GitOps (Argo CD or Flux) once
    there's more than one environment.
11. **Cost and teardown.** EKS charges per cluster-hour on top of nodes, the
    ALB, RDS and any NAT gateways. Check current AWS pricing, set a budget
    alarm, and make sure `terraform destroy` (or the equivalent) cleanly
    removes everything, including the ALBs the controller creates.

## 11. Appendix: Kubernetes kinds, a primer

This appendix is for readers learning Kubernetes. It explains each kind of
object this spec uses, what it does here, and why it was picked over the
alternatives. [§11.8](#118-control-data-and-management-planes) then shows
where each piece sits in Kubernetes' control, data and management planes.
The manifests aren't written yet, so this describes the planned design.

### 11.1 Core ideas first

- **A manifest declares desired state.** Each YAML document is one
  [object](https://kubernetes.io/docs/concepts/overview/working-with-objects/)
  with an `apiVersion`, a `kind` (its type) and a `spec` (what you want).
  You `kubectl apply` it, and a
  [controller](https://kubernetes.io/docs/concepts/architecture/controller/)
  keeps working until the cluster matches. Compose does something similar,
  but Kubernetes keeps reconciling: if a pod dies, it's replaced.
- **Kinds build on each other.** You rarely create a Pod yourself. You
  create a Deployment, and it creates the Pods.
- **Names are DNS.** A Service named `postgres` is reachable at
  `postgres:5432` from any pod in the same namespace
  ([DNS for Services](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)).
  That's why compose's config files work unchanged
  ([§4.5](#45-monitoring)).
- **Labels connect things.** A Service finds its pods by
  [label selector](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/),
  not by name. This spec also adds the
  [recommended label](https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/)
  `app.kubernetes.io/part-of: imdb` to everything, so the scripts can delete
  by label ([§4.1](#41-layout)).

### 11.2 How a browser request flows

```text
browser → localhost:${FRONTEND_PORT}
  → Service (type LoadBalancer, created by Envoy Gateway)
    → Envoy proxy Pod       ← configured by Gateway + HTTPRoute
      ├─ /api/* → Service posts:8080    → posts Pod (Deployment)
      │                                     → Service postgres:5432
      │                                       → postgres Pod (StatefulSet) → PVC
      └─ /*     → Service frontend:80   → frontend Pod (Deployment)
```

### 11.3 Organizing

| Kind | Used for | Why |
|---|---|---|
| [Namespace](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/) | `imdb`, which holds all of the app's resources | Keeps the app apart from system components (`kube-system`, `envoy-gateway-system`). `k8s-shutdown.sh --all` can delete the whole namespace in one step |
| `Kustomization` ([Kustomize](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/)) | `base/` and `overlays/local/` | **Not a cluster object.** It's a build file that `kubectl kustomize` reads to assemble the final YAML. The base holds what every environment shares, and an overlay patches in what differs (image tags, ports). A future `overlays/eks` reuses the same base ([§8.1](#81-kustomize-now-helm-later)) |

### 11.4 Running workloads

| Kind | Used for | Why this kind |
|---|---|---|
| [Pod](https://kubernetes.io/docs/concepts/workloads/pods/) | Every running container | The smallest unit Kubernetes runs: one or more containers sharing a network address. This spec never writes Pods directly. The kinds below create them |
| [Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) | `posts`, `frontend`, `prometheus`, `grafana` | For **stateless** apps where any copy is interchangeable. It does rolling updates and replaces failed pods. `k8s-reload.sh` uses `kubectl rollout restart` to swap in a rebuilt image |
| [StatefulSet](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/) | `postgres` | For apps that need a **stable identity and their own disk**. The pod is always `postgres-0`, and `volumeClaimTemplates` gives it a dedicated volume that survives restarts. A Deployment would treat the database like a replaceable web server |
| [Job](https://kubernetes.io/docs/concepts/workloads/controllers/job/) | Data loaders (`k8s-load.sh`) | For **run-to-completion** work. A Deployment would restart the loader forever after it exits. `backoffLimit: 0` means one attempt, and [`ttlSecondsAfterFinished`](https://kubernetes.io/docs/concepts/workloads/controllers/ttlafterfinished/) cleans up old Jobs. This is the k8s version of `docker compose run --rm` ([§4.6](#46-data-loaders-as-jobs)) |

Pod-level features this spec also relies on:

- [Init containers](https://kubernetes.io/docs/concepts/workloads/pods/init-containers/):
  `posts` waits for Postgres before starting. This replaces compose's
  `depends_on: condition: service_healthy`.
- [Probes](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/):
  *startup* gives the JVM time to boot, *liveness* restarts a stuck pod,
  and *readiness* keeps traffic away until the pod can serve.
- [Resource requests and limits](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
  and [`securityContext`](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/)
  (run as non-root, drop Linux capabilities).

### 11.5 Networking

| Kind | Used for | Why |
|---|---|---|
| [Service](https://kubernetes.io/docs/concepts/services-networking/service/) (`ClusterIP`) | `postgres`, `posts`, `frontend`, `prometheus`, `grafana` | Pods come and go and get new IPs each time. A Service gives them one stable name and IP, and spreads traffic across matching pods. [`ClusterIP`](https://kubernetes.io/docs/concepts/services-networking/service/#type-clusterip) (the default type) is reachable only inside the cluster, so nothing is exposed by accident |
| Service (`LoadBalancer`) | The Gateway's entry point | **Created by Envoy Gateway, not by us.** A [`LoadBalancer`](https://kubernetes.io/docs/concepts/services-networking/service/#loadbalancer) Service asks the platform for an external address. Docker Desktop maps it to `localhost`. On EKS, the AWS controller creates an ALB instead |
| [GatewayClass](https://gateway-api.sigs.k8s.io/api-types/gatewayclass/) | `imdb`, in the **overlay** | Says *which controller* implements Gateways: Envoy Gateway locally, the AWS Load Balancer Controller on EKS. It's the only routing object that changes between environments, which is why it lives in the overlay |
| [Gateway](https://gateway-api.sigs.k8s.io/api-types/gateway/) | `imdb`, one HTTP listener on `FRONTEND_PORT` | The entry point: which ports and protocols to accept. Comparable to "the load balancer's front door" |
| [HTTPRoute](https://gateway-api.sigs.k8s.io/api-types/httproute/) | `/api` → `posts`, `/` → `frontend` | The routing rules behind that door. This is what gives the browser one origin, so there's no CORS ([§4.3](#43-routing-gateway-api--envoy-gateway)) |

**Why the [Gateway API](https://gateway-api.sigs.k8s.io/) instead of
[Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)?**
Ingress is the older, single-object way to route HTTP. Its most common
controller, ingress-nginx, was retired in March 2026. The Gateway API
splits the job into three roles: the infrastructure owner picks the
GatewayClass, the cluster operator defines the Gateway, and app teams write
HTTPRoutes. That split is what lets the same Gateway and HTTPRoute move to
EKS unchanged ([§8.2](#82-ingress-controller)).
[Envoy Gateway](https://gateway.envoyproxy.io/) is the controller that
turns these objects into a running Envoy proxy.

**Not a kind, but useful:**
[`kubectl port-forward`](https://kubernetes.io/docs/tasks/access-application-cluster/port-forward-access-application-cluster/)
tunnels a local port to a Service on demand. `k8s-port-forward.sh` uses it
to reach Postgres, Prometheus and Grafana without exposing them
permanently.

### 11.6 Configuration and storage

| Kind | Used for | Why |
|---|---|---|
| [ConfigMap](https://kubernetes.io/docs/concepts/configuration/configmap/) | `prometheus-config`, `grafana-datasources`, `grafana-dashboards` | Non-secret config files, mounted into the pod as files. These are generated by Kustomize's [`configMapGenerator`](https://kubectl.docs.kubernetes.io/references/kustomize/kustomization/configmapgenerator/) from compose's existing files. The generated name includes a content hash, so editing a file automatically rolls the pod ([§4.5](#45-monitoring)) |
| [Secret](https://kubernetes.io/docs/concepts/configuration/secret/) | `postgres-credentials`, `grafana-admin` | Like a ConfigMap, but for passwords. They're created by the scripts from `.env` and never committed. Note that Secrets are only base64-encoded, **not encrypted**, by default. That's fine locally, and why EKS uses AWS Secrets Manager instead ([§10](#10-future-steps-deploying-to-aws-eks) step 4) |
| [PersistentVolumeClaim](https://kubernetes.io/docs/concepts/storage/persistent-volumes/) (PVC) | Postgres (2Gi), Prometheus (2Gi), Grafana (1Gi) | A pod's own filesystem is wiped when the pod is replaced. A PVC is a request for durable storage that outlives pods, and it plays the same role as a compose named volume. `k8s-shutdown.sh` keeps PVCs by default, so data survives a restart |
| [StorageClass](https://kubernetes.io/docs/concepts/storage/storage-classes/) | Docker Desktop's default `hostpath` | **Not created by us.** It decides *how* a PVC gets real disk: a folder on the Docker Desktop VM locally, an EBS volume on EKS. PVCs don't name one, so they pick up each cluster's default |

### 11.7 Extending Kubernetes

[CustomResourceDefinitions (CRDs)](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/)
add new kinds to a cluster. `GatewayClass`, `Gateway` and `HTTPRoute` are
not built into Kubernetes. Envoy Gateway's `install.yaml` installs their
CRDs, which is why it must be installed before our manifests can be
applied. It also installs its own Deployment, Services and RBAC objects in
the `envoy-gateway-system` namespace. Those belong to Envoy Gateway, not to
this app.

### 11.8 Control, data and management planes

"Plane" is borrowed from networking. It splits a system by **job**, not by
machine:

- **Control plane: decides.** It stores what you asked for and keeps
  working until reality matches. In Kubernetes these are the
  [control plane components](https://kubernetes.io/docs/concepts/overview/components/#control-plane-components):
  - `kube-apiserver`, the front door every `kubectl` command talks to.
  - `etcd`, the database holding every object.
  - `kube-scheduler`, which picks a node for each pod.
  - `kube-controller-manager`, which runs the built-in controllers
    (Deployment, StatefulSet, Job and so on).
- **Data plane: does.** This is where your containers run and your traffic
  flows: the worker nodes and their
  [node components](https://kubernetes.io/docs/concepts/overview/components/#node-components).
  - `kubelet` starts the containers and runs the probes.
  - The container runtime actually runs the containers.
  - `kube-proxy` makes Service IPs work.
  - Your app pods run here too.
- **Management plane: tells.** These are the tools humans and automation
  use to express intent and observe the result. They talk *to* the
  control plane, never directly to pods.

Kubernetes' own docs formally define only the control plane and the nodes.
"Data plane" is the common name for the nodes and is used by AWS's
[EKS docs](https://docs.aws.amazon.com/eks/latest/userguide/eks-architecture.html).
"Management plane" is an informal term, and vendors draw its edges
differently. Treat this split as a mental model, not a spec.

**The key idea:** every `kind` you write is a *record* in the control plane,
stored in etcd. Its *effect* happens in the data plane. A Service object is
just a row in etcd. The traffic forwarding it causes happens on each node,
in rules programmed by kube-proxy.

```text
 MANAGEMENT PLANE         CONTROL PLANE                       DATA PLANE
 (you + your tools)       (decides)                           (does)
┌──────────────────┐     ┌────────────────────────────┐      ┌───────────────────────────────┐
│ k8s-*.sh scripts │     │ kube-apiserver ◄──► etcd   │      │ kubelet, container runtime    │
│ kubectl          │────►│ scheduler                  │─────►│ kube-proxy, CoreDNS           │
│ Kustomize        │apply│ controller-manager         │watch │ postgres, posts, frontend,    │
│ .env → patch     │     │ ┄┄ add-on controllers ┄┄   │      │   prometheus, grafana pods    │
│ Grafana UI ¹     │     │ Envoy Gateway controller ² │─────►│ Envoy proxy pods  ◄── browser │
└──────────────────┘     │ storage provisioner ²      │      │ PV disks (hostpath)           │
                         └────────────────────────────┘      └───────────────────────────────┘
```

¹ Prometheus and Grafana *run* as ordinary pods in the data plane, but
their *job* is observing the system. That's why many people group
monitoring with management.
² Add-on controllers run as ordinary pods on worker nodes, but their job
is control-plane work. **The plane is the role, not the location.**

#### Where each piece in this spec sits

**Management plane.** These never run in the cluster:

| Piece | Role |
|---|---|
| `scripts/k8s-*.sh`, `kubectl` | Send manifests to the API server, and wait on or query their status |
| Kustomize (`base/`, `overlays/local/`) | Builds the YAML on your machine. The cluster never sees a `Kustomization`, only its output |
| `.env` → `.generated/env-patch.yaml` | Turns local settings into intent before it's sent |
| `kc()` context guard ([§4.7](#47-scripts)) | Decides *which* control plane receives the intent. This is a management-plane safety rail |
| `kubectl port-forward` | An operator's tunnel. The API server relays it to a pod, and it's meant for people, not app traffic |

**Control plane records, and the data-plane effect of each:**

| Kind | Reconciled by (control plane) | What happens in the data plane |
|---|---|---|
| Namespace | Namespace controller | Nothing runs. It only scopes names and permissions |
| Deployment | Deployment controller → ReplicaSet → scheduler | kubelet starts the `posts`, `frontend`, `prometheus` and `grafana` containers and runs their probes |
| StatefulSet | StatefulSet controller → scheduler | kubelet starts `postgres-0`, attached to its own volume |
| Job | Job controller, plus the TTL controller for cleanup | A loader pod runs once and exits |
| Service (`ClusterIP`) | EndpointSlice controller tracks which pods match | kube-proxy programs forwarding rules on every node, and CoreDNS answers `posts`, `postgres` and so on |
| Service (`LoadBalancer`) | Envoy Gateway creates it, and the platform fulfils it | Docker Desktop publishes it on `localhost`. On EKS, AWS builds a load balancer *outside* the cluster |
| GatewayClass, Gateway, HTTPRoute | **Envoy Gateway controller** (add-on) | Envoy proxy pods get their routing config pushed to them, and every browser request flows through them |
| ConfigMap, Secret | None. They're stored in etcd and read on demand | kubelet mounts them into pods as files or env vars |
| PersistentVolumeClaim | PV controller + **storage provisioner** (add-on: Docker Desktop's `hostpath` provisioner, the EBS CSI driver on EKS) | A real directory or disk is attached to the pod |
| CRD | kube-apiserver itself. It adds new API endpoints | Nothing directly. It's what makes the Gateway kinds above possible |

**Envoy Gateway shows the split in miniature.** It has its own control
plane, the `envoy-gateway` controller pod. That pod watches
Gateway/HTTPRoute objects and translates them into proxy configuration.
It also has its own data plane, the Envoy proxy pods that actually carry
the requests. If the controller crashes, traffic keeps flowing with the
last config. You just can't change routes until it's back.

#### Why the split matters

- **Failure behavior.** If the control plane goes down, running pods keep
  serving traffic. What stops is change and self-healing: no new pods, no
  restarts after a crash, no new routes. If the data plane goes down, users
  feel it immediately.
- **Security.** The management plane holds the keys to the control plane,
  and the control plane can do anything to the data plane. That's why this
  spec pins the kubectl context ([§4.7](#47-scripts)) and keeps Secrets out
  of git ([§5](#5-security-considerations)). It's also why etcd's
  base64-only Secrets are an EKS concern
  ([§10](#10-future-steps-deploying-to-aws-eks) step 4).
- **Local vs EKS.** On Docker Desktop, the control plane and the data plane
  share **one node**, so the split is easy to miss. On EKS, AWS runs and
  hides the control plane, and you pay per cluster-hour for it. You run the
  data plane (worker nodes), unless you use Auto Mode or Fargate, which
  hand more of it to AWS. The management plane grows to include Terraform,
  GitHub Actions and maybe Argo CD ([§10](#10-future-steps-deploying-to-aws-eks)
  steps 1 and 10).

### 11.9 Kinds deliberately not used yet

They're listed in [§10](#10-future-steps-deploying-to-aws-eks) for EKS,
where they start to matter.

| Kind | What it does | Why not now |
|---|---|---|
| [PodDisruptionBudget](https://kubernetes.io/docs/concepts/workloads/pods/disruptions/) | Keeps a minimum number of pods up during node maintenance | Meaningless with one replica on one node |
| [HorizontalPodAutoscaler](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/) | Adds or removes replicas based on load | No real load locally |
| [NetworkPolicy](https://kubernetes.io/docs/concepts/services-networking/network-policies/) | Firewall rules between pods | Out of scope locally ([§3](#3-out-of-scope)). They only take effect if the cluster's network plugin enforces them, which Docker Desktop's may not |
| `ServiceMonitor` ([Prometheus Operator](https://prometheus-operator.dev/)) | Tells Prometheus which Services to scrape | A static scrape target is enough with one `posts` pod |

### 11.10 Exploring on your own

Once the stack is running:

```bash
kubectl --context docker-desktop get all -n imdb        # most objects at a glance
kubectl --context docker-desktop get gateway,httproute,pvc,configmap,secret -n imdb
kubectl explain deployment.spec.strategy                # built-in docs for any field
kubectl api-resources                                   # every kind the cluster knows, CRDs included
kubectl --context docker-desktop get pods -n kube-system           # the control plane itself: apiserver, etcd, scheduler...
kubectl --context docker-desktop get pods -n envoy-gateway-system  # Envoy Gateway's controller and proxy pods
```

`kubectl explain` and `kubectl api-resources` are documented in the
[kubectl reference](https://kubernetes.io/docs/reference/kubectl/).

## 12. Implementation notes

Implemented 2026-11-16. Static checks (V1–V3, J4 manifest quoting, and
P3's "cluster unreachable" path) passed while Docker Desktop was down. The
cluster checks are in [verification.md](verification.md), phase by phase.

Where the implementation differs from the design above, and why:

| Area | Change | Why |
|---|---|---|
| S5 ([§7.2](#72-smoke-checks-k8s-smoke-testsh)) | `/actuator/health` is checked for "no actuator JSON", not "not 200" | The path matches the `/` rule, so nginx's `try_files` returns `index.html` with a 200. The original check could never pass |
| Generated patch ([§4.4](#44-configuration-from-env)) | Two files, `.generated/gateway-port.yaml` (JSON6902) and `.generated/posts-cors.yaml` (strategic merge), instead of one `env-patch.yaml` | Kustomize needs a separate `patches:` entry per patch type |
| Overlay namespace | The overlay sets no `namespace:`. Each `configMapGenerator` sets `namespace: imdb` instead | An overlay-wide namespace would also stamp the cluster-scoped GatewayClass, because Kustomize doesn't know that CRD is cluster-scoped |
| Image probe (T1, Q1) | `k8s-precheck.sh --image-probe`, and `k8s-run.sh` also runs the probe before applying | It fails in seconds with a pointer to Q1, instead of a 5-minute rollout timeout. Uses `imagePullPolicy: Never`, so it can't fall back to Docker Hub |
| P4 ([§7.3](#73-other-functional-checks)) | `scripts/k8s-verify-static.sh` also checks it statically: it fails if any k8s script calls `kubectl` other than through `kc()` (offline `kustomize`, read-only `config` queries and message text are allowed). The live context-switch test stays as an optional demonstration | The live test only covers the precheck script, at the moment it's run. The static check covers every script, on every run, with no cluster |
| `k8s-run.sh --render` | New flag: prints the rendered YAML, no cluster needed | Needed for V3/V4 and debugging, since the overlay can't be rendered without the generated patches |
| `k8s-port-forward.sh gateway` | New target, not part of `all` | Fallback if Docker Desktop doesn't publish the Envoy `LoadBalancer` Service on localhost. That's unverified for the cluster's provisioning mode |
| Gateway wait | `k8s-run.sh` warns, rather than fails, if the Gateway isn't `Programmed` within 2 min | Envoy Gateway reports `Programmed=False` when the LoadBalancer has no address. The port-forward fallback still works then |
| Prometheus, Grafana | `strategy: Recreate` | Each holds a lock on its RWO volume (TSDB lock, SQLite), so a rolling update would deadlock |
| Loader Jobs | `PYTHONUNBUFFERED=1`, and user args containing `$(` are escaped to `$$(` | Logs stream live, and user text can't be expanded as a Kubernetes `$(VAR)` reference |
| Envoy Gateway | Pinned to `v1.10.0` (checked 2026-11-16) | The newest stable release with an `install.yaml` asset |

Q1 answer (2026-11-16): the cluster is **kubeadm** with Docker's own image
store. Pod containers show up in `docker stats` as `k8s_<container>_<pod>_…`,
and locally built `:local` images ran with no load step. (An earlier guess
of kind mode, based on the API server's `127.0.0.1:<random port>` address,
was wrong.)

Grafana probes (found 2026-11-16): with the default 1s probe timeout,
Grafana was killed by its liveness probe the first time someone opened it.
`/api/health` checks its SQLite DB, which stalls for a few seconds while
Grafana loads plugins and dashboards. The probes now use `timeoutSeconds: 5`,
and liveness uses `failureThreshold: 6`. Compose never showed this because
it has no liveness kill.
