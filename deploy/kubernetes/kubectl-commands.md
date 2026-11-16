# kubectl commands for this stack

A reference for running and debugging this repo's local Kubernetes stack,
in three parts:

1. [Monitoring commands](#1-monitoring-commands): what's running, what's broken, and why.
2. [Important commands](#2-important-commands): changing and debugging things by hand.
3. [Commands used in the scripts](#3-commands-used-in-the-scripts): what `scripts/k8s-*.sh` run, and why.

Each section is in priority order: learn the top rows first. In the
**Script** column, ✅ means at least one `scripts/k8s-*.sh` script runs that
command, possibly with different flags or arguments.
[Section 3](#3-commands-used-in-the-scripts) shows the exact forms.

## Setup: the `kc` alias

Every command below uses `kc`, the same name the scripts use for their
context-pinned wrapper:

```bash
alias kc='kubectl --context docker-desktop'
```

Add it to `~/.zshrc` to keep it. Pinning the context means a command can
never hit another cluster by accident, for example a future EKS one, even
if your current context points there.

Names used throughout: the app lives in namespace `imdb`. Envoy Gateway
lives in `envoy-gateway-system`. Workloads are `statefulset/postgres` and
`deploy/posts`, `deploy/frontend`, `deploy/prometheus`, `deploy/grafana`.

---

## 1. Monitoring commands

| # | Command | Use it to | Script |
|---|---|---|---|
| 1 | `kc get pods -n imdb` | Get the first answer to "is it working?" `READY 1/1` and `STATUS Running` are good. `CrashLoopBackOff`, `ImagePullBackOff`, `Pending` or a growing `RESTARTS` count are not | ✅ |
| 2 | `kc describe pod <pod> -n imdb` | Find out **why** a pod is unhealthy. Read the **Events** section at the bottom for failed probes, image errors, OOM kills and scheduling problems | |
| 3 | `kc logs deploy/posts -n imdb` | Read the app's output. Add `-f` to follow it live and `--tail=100` to limit it. For a frontend or Postgres problem, use `deploy/frontend` or `statefulset/postgres` | ✅ |
| 4 | `kc logs deploy/posts -n imdb --previous` | Read the logs of the **crashed** container. After a restart, plain `logs` only shows the new one. This is the go-to for `CrashLoopBackOff` | |
| 5 | `kc events -n imdb` | See recent events for the whole namespace, oldest first. Add `--watch` to stream them. Good for "something is wrong but I don't know which pod" | |
| 6 | `kc get pods -n imdb -w` | Watch pods change state live, e.g. during a deploy, reload or delete. Ctrl-C to stop | |
| 7 | `kc rollout status deploy/posts -n imdb` | Block until a Deployment or StatefulSet finishes rolling out, or report why it's stuck | ✅ |
| 8 | `kc get gateway,httproute -n imdb` | Check routing. The Gateway should show `PROGRAMMED True`. If it doesn't, `describe` it to see the conditions | ✅ |
| 9 | `kc get svc -n envoy-gateway-system` | Check the Envoy `LoadBalancer` Service. `EXTERNAL-IP localhost` means the app is reachable at `localhost:${FRONTEND_PORT}` | ✅ |
| 10 | `kc get all -n imdb` | Get an overview of the pods, Services, Deployments, StatefulSets and ReplicaSets in one list. It doesn't cover PVCs, ConfigMaps, Secrets or Gateways | |
| 11 | `kc get pvc -n imdb` | Check persistent storage. All three claims (`data-postgres-0`, `prometheus-data`, `grafana-data`) should be `Bound` | |
| 12 | `kc logs -n envoy-gateway-system deploy/envoy-gateway` | Debug routing. The Envoy Gateway controller logs why a Gateway or HTTPRoute wasn't accepted | |
| 13 | `kc logs -n envoy-gateway-system -l gateway.envoyproxy.io/owning-gateway-name=imdb -c envoy` | See the requests that reach the Envoy proxy, and the errors it returns (e.g. a 503 when posts is down) | |
| 14 | `kc get pod <pod> -n imdb -o yaml` | See everything about one object, including the `status:` block. Add `-o jsonpath='{...}'` to pull out a single field | ✅ |
| 15 | `kc get pods -A` | See pods in **every** namespace, including the Kubernetes system pods (`kube-system`) and Envoy Gateway's | |
| 16 | `kc get nodes` / `kc describe node` | Check the node is `Ready`. The **Allocated resources** section of `describe` shows how much CPU and memory the pods have claimed | ✅ |
| 17 | `kc top pods -n imdb` | See live CPU and memory per pod. **This needs metrics-server**, which Docker Desktop doesn't install by default. Until it's installed, this errors | |

**App-level metrics** come from Prometheus and Grafana, not kubectl. Open
the tunnels first with `./scripts/k8s-port-forward.sh`, which runs
`kc port-forward` ✅. Then:

- Prometheus targets: <http://localhost:9090/targets> (posts should be **UP**)
- Grafana: <http://localhost:3000> (the "posts — JVM & HTTP overview" dashboard)

---

## 2. Important commands

| # | Command | Use it to | Script |
|---|---|---|---|
| 1 | `kubectl config get-contexts` / `kubectl config current-context` | Check **which cluster** plain `kubectl` talks to. Run this before any plain-`kubectl` command that changes things. `kc` doesn't need it | ✅ |
| 2 | `kc apply -f <file.yaml>` | Create or update objects to match the file. It's declarative: you can run it again safely. For this stack, deploy with `./scripts/k8s-run.sh` instead | ✅ |
| 3 | `kc exec -it deploy/posts -n imdb -- sh` | Open a shell inside a running container | |
| 4 | `kc exec -it statefulset/postgres -n imdb -- psql -U postgres -d posts-db` | Open a SQL prompt in the database, with no port-forward or local `psql` needed | |
| 5 | `kc port-forward -n imdb svc/grafana 3000:3000` | Tunnel a local port to a Service inside the cluster. `./scripts/k8s-port-forward.sh` wraps this | ✅ |
| 6 | `kc rollout restart deploy/posts -n imdb` | Replace a Deployment's pods with fresh ones, e.g. after rebuilding a `:local` image. `./scripts/k8s-reload.sh` wraps this | ✅ |
| 7 | `kc delete pod <pod> -n imdb` | Kill one pod. Its Deployment or StatefulSet creates a replacement, so this is a quick way to restart a single pod or test self-healing | ✅ |
| 8 | `kc scale deploy/posts -n imdb --replicas=0` | Stop a workload without deleting it. Scale back with `--replicas=1` | |
| 9 | `kc diff -f <file.yaml>` | Preview what an apply would change. For this stack: `./scripts/k8s-run.sh --render \| kc diff -f -` | |
| 10 | `kc apply --dry-run=server -f <file.yaml>` | Validate manifests against the live cluster, including the CRDs, without changing anything | |
| 11 | `kc run tmp -n imdb --rm -it --restart=Never --image=curlimages/curl -- curl -s posts:8081/actuator/health` | Run a throwaway pod to test the network from **inside** the cluster, e.g. a Service name or an unrouted port like 8081. `--rm` deletes the pod afterwards | ✅ |
| 12 | `kc delete -n imdb <kinds> -l app.kubernetes.io/part-of=imdb` | Delete everything with a label in one go. `./scripts/k8s-shutdown.sh` does this | ✅ |
| 13 | `kc get secret postgres-credentials -n imdb -o jsonpath='{.data.POSTGRES_PASSWORD}' \| base64 -d` | Read a Secret's value. Secrets are only base64-encoded, not encrypted. This prints the password, so don't paste the output anywhere | |
| 14 | `kc create secret generic <name> -n imdb --from-literal=KEY=value --dry-run=client -o yaml \| kc apply -f -` | Create **or update** a Secret. Plain `create` fails if the Secret already exists | ✅ |
| 15 | `kc rollout history deploy/posts -n imdb` / `kc rollout undo deploy/posts -n imdb` | List or revert to earlier pod templates. **Caveat:** with `:local` tags, undo doesn't bring back older *code*. The tag still points at the latest build | |
| 16 | `kc explain deployment.spec.strategy` | Read the built-in docs for any field, without opening a browser | |
| 17 | `kc api-resources` | List every kind the cluster knows, including CRDs like `gateways` and `httproutes`, with short names and whether each is namespaced | |
| 18 | `kubectl kustomize <dir>` | Build Kustomize YAML locally, without applying it. For this repo, use `./scripts/k8s-run.sh --render`, which adds the generated `.env` patches and the flag the overlay needs | ✅ |

---

## 3. Commands used in the scripts

Exactly what `scripts/k8s-*.sh` run, in priority order. In the scripts, `kc`
is a function in [`lib-k8s.sh`](../../scripts/lib-k8s.sh) that expands to
`kubectl --context "$K8S_CONTEXT"`, so the context is always
`docker-desktop`.

| # | Command (as the scripts run it) | What it does | Used in |
|---|---|---|---|
| 1 | `kc apply -f -` | Applies the rendered overlay (piped in) to the cluster. This is the actual deploy step | `k8s-run.sh` |
| 2 | `kubectl kustomize --load-restrictor LoadRestrictionsNone deploy/kubernetes/overlays/local` | Renders the base and the local overlay into plain YAML. The flag lets the overlay read compose's monitoring files under `deploy/docker/` | `lib-k8s.sh` (`render_local`), via `k8s-run.sh` and `k8s-verify-static.sh` |
| 3 | `kc rollout status -n imdb <workload> --timeout=5m` | Waits until each workload's pods are ready. posts' readiness implies Flyway has finished | `k8s-run.sh`, `k8s-reload.sh` |
| 4 | `kc wait -n imdb gateway/imdb --for=condition=Programmed --timeout=2m` | Waits until Envoy has the routes loaded and an address assigned | `k8s-run.sh` |
| 5 | `kc rollout restart -n imdb deployment/<name>` | Starts new pods from the rebuilt `:local` image | `k8s-reload.sh` |
| 6 | `kc -n imdb port-forward --address 127.0.0.1 svc/<name> <local>:<remote>` | Opens a localhost-only tunnel to Postgres, Prometheus, Grafana, or the Envoy Service (`gateway`) | `k8s-port-forward.sh` |
| 7 | `kc -n imdb logs -f job/<job>` | Streams a loader Job's output until it exits | `k8s-load.sh` |
| 8 | `kc apply -f - <<YAML …` | Creates a loader Job from a manifest the script writes on the fly | `k8s-load.sh` |
| 9 | `kc -n imdb create secret generic <name> --from-literal=… --dry-run=client -o yaml \| kc apply -f -` | Creates or updates `postgres-credentials` and `grafana-admin` from `.env` | `lib-k8s.sh` (`ensure_secrets`) |
| 10 | `kc create namespace imdb --dry-run=client -o yaml \| kc apply -f -` | Creates the namespace if it's missing. Running it again is harmless | `lib-k8s.sh` (`ensure_namespace`) |
| 11 | `kc apply --server-side -f https://github.com/envoyproxy/gateway/releases/download/<ver>/install.yaml` | Installs Envoy Gateway and the Gateway API CRDs from the pinned release. Server-side apply avoids the size limit that client-side apply hits on large CRDs | `lib-k8s.sh` (`ensure_envoy_gateway`) |
| 12 | `kc wait --timeout=5m -n envoy-gateway-system deployment/envoy-gateway --for=condition=Available` | Waits for the Envoy Gateway controller before anything uses it | `lib-k8s.sh` (`ensure_envoy_gateway`) |
| 13 | `kc delete -n imdb deployment,statefulset,service,configmap,job,httproute,gateway -l app.kubernetes.io/part-of=imdb --ignore-not-found --timeout=3m` | Default shutdown: removes the workloads by label. PVCs and Secrets aren't in the kind list, so the data survives | `k8s-shutdown.sh` |
| 14 | `kc delete namespace imdb --ignore-not-found --timeout=3m` / `kc delete gatewayclass imdb …` | `--all` shutdown: deleting the namespace deletes everything in it, data included. The GatewayClass is cluster-scoped, so it's deleted separately | `k8s-shutdown.sh` |
| 15 | `kc -n imdb run image-probe-<n> --image=imdb/posts:local --image-pull-policy=Never --restart=Never --labels=… --command -- true` | Proves the cluster can run a locally built image with no registry pull (spec Q1). With `Never`, a missing image fails fast with `ErrImageNeverPull` | `lib-k8s.sh` (`probe_image_sharing`), via `k8s-precheck.sh --image-probe` and `k8s-run.sh` |
| 16 | `kc -n imdb get pod <pod> -o jsonpath='{.status.phase}'` (and `…state.waiting.reason`) | Reads a single status field so the script can decide what to do: wait, stream logs, or fail | `lib-k8s.sh`, `k8s-load.sh` |
| 17 | `kc -n imdb get job <job> -o jsonpath='{.status.succeeded}'` / `{.status.failed}` | Reads a loader Job's outcome after its logs end | `k8s-load.sh` |
| 18 | `kc -n imdb delete job <job>` | Removes a successful loader Job. Failed ones are kept for inspection | `k8s-load.sh` |
| 19 | `kc -n imdb delete pod <probe> --ignore-not-found --wait=false` | Cleans up the image-probe pod without waiting for it | `lib-k8s.sh` |
| 20 | `kc get nodes --request-timeout=10s` | Quick check that the cluster answers. The timeout keeps a dead cluster from hanging the script | `k8s-precheck.sh`, `k8s-shutdown.sh` |
| 21 | `kubectl config get-contexts -o name` | Checks the `docker-desktop` context exists. It only reads your kubeconfig, so no `--context` is needed | `k8s-precheck.sh` |
| 22 | `kc get gateway imdb -n imdb` | Checks whether the stack is already deployed. If it is, the Gateway legitimately owns `FRONTEND_PORT` | `k8s-precheck.sh` |
| 23 | `kc get deployment envoy-gateway -n envoy-gateway-system` | Checks whether Envoy Gateway is already installed, to skip reinstalling it | `lib-k8s.sh` (`envoy_gateway_installed`) |
| 24 | `kc get svc -n envoy-gateway-system -l gateway.envoyproxy.io/owning-gateway-name=imdb,… -o jsonpath='{.items[0].metadata.name}'` | Finds the generated name of Envoy's proxy Service for the `imdb` Gateway | `lib-k8s.sh` (`envoy_service_name`), via `k8s-port-forward.sh gateway` |
| 25 | `kc get namespace imdb` / `kc get deployment -n imdb posts frontend` | Guard checks: refuse to run a loader or a reload when the stack isn't deployed | `k8s-load.sh`, `k8s-reload.sh` |

`k8s-smoke-test.sh` uses no kubectl at all, only `curl` against the app's
URL. That's why it can be pointed at another deployment later.

### Patterns worth reusing

- **`create … --dry-run=client -o yaml | kc apply -f -`** turns an
  imperative `create` into an idempotent "create or update". The scripts
  use it for the namespace and the Secrets (rows 9 and 10).
- **`-o jsonpath='{…}'`** pulls one field out of an object, so a script can
  branch on it without parsing YAML (rows 16, 17 and 24).
- **`-l <label>`** acts on a group of objects by label instead of by name
  (row 13). Every object here carries `app.kubernetes.io/part-of: imdb`.
- **`--ignore-not-found`** makes deletes safe to run again (rows 13, 14
  and 19).
- **`--timeout` on `wait`, `rollout status` and `delete`** means a stuck
  cluster fails the script with a message, instead of hanging forever.
