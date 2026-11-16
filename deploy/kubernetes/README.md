# Local Kubernetes deployment

Runs the whole stack (Postgres, `posts`, frontend, Prometheus, Grafana and
the data loaders) on Docker Desktop's built-in Kubernetes. The browser uses
one origin, `http://localhost:${FRONTEND_PORT}`: the UI is at `/` and the API
at `/api`, routed by the Gateway API (Envoy Gateway). No application code
differs from the compose stack. Only env vars do.

- Design and rationale: [`docs/specs/kubernetes-local/spec.md`](../../docs/specs/kubernetes-local/spec.md)
- New to Kubernetes? Read the spec's [primer appendix](../../docs/specs/kubernetes-local/spec.md#11-appendix-kubernetes-kinds-a-primer)
- Step-by-step checks, phase by phase: [`docs/specs/kubernetes-local/verification.md`](../../docs/specs/kubernetes-local/verification.md)
- kubectl commands for monitoring and debugging this stack, and what the scripts run: [`kubectl-commands.md`](kubectl-commands.md)

## Prerequisites

1. **Docker Desktop with Kubernetes enabled**: Settings → Kubernetes →
   enable it, then wait until it shows as running. This gives you the
   `docker-desktop` kubectl context. Docker Desktop also ships `kubectl`.
2. **Memory**: give Docker Desktop at least 6 GB (Settings → Resources).
   Envoy Gateway, the Envoy proxy and the Kubernetes system pods run on top
   of the app itself.
3. **Only one stack at a time.** Stop compose first (`./scripts/docker-shutdown.sh`).
   Both stacks want `FRONTEND_PORT`, and `k8s-precheck.sh` refuses to start
   while compose is running.
4. Optional: a `.env` at the repo root (copy [`.env.example`](../../.env.example)).
   Both stacks read the same file. `API_PORT` is unused here.

## Quick start

```bash
./scripts/k8s-precheck.sh --image-probe   # first time: proves the cluster sees local images
./scripts/k8s-run.sh --all                # deploy + seed both domains (first run: several minutes)
./scripts/k8s-smoke-test.sh               # exit code 0 = healthy
open "http://localhost:${FRONTEND_PORT:-4200}"
./scripts/k8s-shutdown.sh                 # stop, keep data
```

**Always deploy through the scripts, not `kubectl apply -k`.** The local
overlay needs two things the scripts do first. They write
`overlays/local/.generated/` from `.env`, and they render with
`--load-restrictor LoadRestrictionsNone`, so the overlay can reuse
compose's monitoring files under `deploy/docker/`. To see what would be
applied, run `./scripts/k8s-run.sh --render`.

## Scripts

Every script takes `-h`/`--help`. They all pin kubectl to the
`docker-desktop` context, so they can never act on another cluster, even
when your current context points somewhere else.

| Script | What it does |
|---|---|
| `k8s-precheck.sh [--image-probe]` | Checks kubectl, Docker, the cluster, that compose is **not** running, and that `FRONTEND_PORT` is free. `--image-probe` also runs a pod from a locally built image with `imagePullPolicy: Never` |
| `k8s-run.sh [bigotry-data] [standard-data] [--all] [--render]` | Runs the precheck, installs Envoy Gateway if it's missing, builds `imdb/{posts,frontend,loaders}:local`, creates the namespace and Secrets, applies the manifests, waits for everything, and optionally seeds data. `--render` only prints the YAML |
| `k8s-reload.sh [frontend\|backend]` | Rebuilds the image(s), then `rollout restart` + `rollout status` |
| `k8s-load.sh <imdb\|bigotry\|standard> [args…]` | Runs a loader as a one-shot Job and streams its logs. The Job is deleted on success and kept on failure |
| `k8s-port-forward.sh [postgres\|prometheus\|grafana\|gateway\|all]` | Opens 127.0.0.1 tunnels on the `.env` ports. The default is `all` (the first three). `gateway` is the fallback for reaching the app itself |
| `k8s-shutdown.sh [--all]` | Deletes the workloads, keeping PVCs and Secrets. `--all` deletes namespace `imdb` (**all data**) and GatewayClass `imdb` |
| `k8s-smoke-test.sh [base-url]` | Curl checks S1–S6. The exit code is the number of failures |
| `k8s-verify-static.sh` | Static checks with no Docker or cluster: script syntax and guards, plus the rendered manifests. The exit code is the number of failures |

## Layout

```text
base/                  # shared by every environment (a future overlays/eks reuses it)
  namespace.yaml
  postgres/            # StatefulSet + Service (PVC via volumeClaimTemplates)
  posts/               # Deployment + Service (8080 http, 8081 management)
  frontend/            # Deployment + Service
  gateway/             # Gateway (listener on FRONTEND_PORT) + HTTPRoute (/api → posts, / → frontend)
  monitoring/          # Prometheus and Grafana: Deployment + Service + PVC each
overlays/local/        # Docker Desktop specifics
  kustomization.yaml   # :local images, IfNotPresent, configMapGenerators, .env patches
  gatewayclass.yaml    # GatewayClass imdb → Envoy Gateway
  .generated/          # gitignored, written from .env by scripts/lib-k8s.sh
```

Every object carries `app.kubernetes.io/part-of: imdb`, which
`k8s-shutdown.sh` deletes by.

## Things to know

- **Data is separate from compose.** k8s Postgres lives in a PVC, and
  compose's lives in the `postgres-data` volume. Seed each stack on its own.
- **Changing `POSTGRES_PASSWORD`** after the first deploy doesn't change
  the existing database. Postgres reads it only at first init, same as
  compose. Run `./scripts/k8s-shutdown.sh --all` (this wipes the data), then
  `./scripts/k8s-run.sh`.
- **The API path differs from compose.** In k8s, posts runs with
  `SERVER_SERVLET_CONTEXTPATH=/api`, so Swagger is at `/api/swagger-ui.html`.
  The frontend doesn't notice, because its `API_BASE_URL` is `/api` here.
- **Actuator (8081) is never routed** through the Gateway. Prometheus
  scrapes it in-cluster.
- **The full `title.basics.tsv`** isn't supported here. The loaders use the
  sample bundled in the image (spec Q5).
- **Envoy Gateway stays installed** after `k8s-shutdown.sh --all`. It's
  cluster-wide infrastructure. To uninstall it:

  ```bash
  kubectl --context docker-desktop delete --ignore-not-found \
    -f https://github.com/envoyproxy/gateway/releases/download/v1.10.0/install.yaml
  ```

  Use the version pinned in `scripts/lib-k8s.sh` (`ENVOY_GATEWAY_VERSION`).

## Troubleshooting

Start with what's running:

```bash
kubectl --context docker-desktop get pods -n imdb
kubectl --context docker-desktop describe pod <pod> -n imdb      # Events at the bottom say why
kubectl --context docker-desktop logs deploy/posts -n imdb
kubectl --context docker-desktop get gateway,httproute -n imdb
kubectl --context docker-desktop get pods,svc -n envoy-gateway-system
```

| Symptom | Likely cause and fix |
|---|---|
| Precheck: cluster not reachable | Kubernetes isn't enabled or hasn't finished starting in Docker Desktop |
| Precheck: compose stack is running | `./scripts/docker-shutdown.sh` first |
| Precheck: port busy | Something else holds `FRONTEND_PORT`: `lsof -nP -iTCP:<port> -sTCP:LISTEN` |
| `ErrImageNeverPull` / `ImagePullBackOff` on `imdb/*:local` | The cluster can't see Docker's image store (spec Q1). Check how Docker Desktop provisions the cluster (Kubernetes view → Edit cluster: *kubeadm* or *kind*). Try the other mode, or turn on the containerd image store (Settings → General). Rerun `./scripts/k8s-precheck.sh --image-probe` after each change |
| Gateway not `Programmed`, or `localhost:${FRONTEND_PORT}` doesn't answer | Docker Desktop didn't give Envoy's `LoadBalancer` Service a localhost address. Check `kubectl --context docker-desktop get svc -n envoy-gateway-system` (`EXTERNAL-IP`). Workaround: `./scripts/k8s-port-forward.sh gateway` |
| posts restarting | `kubectl ... logs deploy/posts -n imdb --previous`. It's usually the DB password (see above) or memory (raise Docker Desktop's limit) |
| A loader Job failed | It's kept. `kubectl ... logs job/<name> -n imdb`. It's removed after an hour, or by `k8s-shutdown.sh` |
| Port-forward: address already in use | The compose stack, or another tunnel, holds that `.env` port |
| Port-forward: `connection refused` then `lost connection to pod` | The pod behind the tunnel restarted, and a tunnel is tied to one pod. Check `RESTARTS` and the reason (`kubectl ... events -n imdb`), then start `k8s-port-forward.sh` again |
