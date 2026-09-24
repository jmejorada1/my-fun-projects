# Observability — Using Micrometer, Prometheus, and Grafana

Day-to-day usage of the metrics stack: dashboards, querying Prometheus,
adding your own metrics, extending the dashboard. For *why* it's wired
this way, see [`architecture.md` §9.5](./architecture.md#95-observability).
For *how* the pipeline works mechanically, see
[`MONITORING-ARCHITECTURE.md`](../../../MONITORING-ARCHITECTURE.md).

## Table of Contents

- [1. What's Running](#1-whats-running)
- [2. Viewing the Dashboard](#2-viewing-the-dashboard)
- [3. Querying Prometheus Directly](#3-querying-prometheus-directly)
- [4. Adding Your Own Metrics](#4-adding-your-own-metrics)
- [5. Editing or Extending the Dashboard](#5-editing-or-extending-the-dashboard)
- [6. Using It Without Docker](#6-using-it-without-docker)
- [7. Troubleshooting](#7-troubleshooting)

## 1. What's Running

[↑ Back to Table of Contents](#table-of-contents)

```bash
./scripts/docker-run.sh   # prometheus + grafana start with everything else
```

| Component | URL | What it's for |
|---|---|---|
| Grafana | <http://localhost:3000> | Dashboards |
| Prometheus | <http://localhost:9090> | Ad hoc PromQL, scrape health under **Status → Targets** |
| `posts`' `/actuator/prometheus` | not published to the host — [`architecture.md` §9.5](./architecture.md#95-observability) | Raw metrics Prometheus scrapes every 15s ([§6](#6-using-it-without-docker) covers hitting it directly) |

**Grafana login**: `admin` / `admin` by default — override via
`GRAFANA_ADMIN_PASSWORD` in `.env`
([`.env.example`](../../../.env.example)). Grafana won't force a password
change when that variable is already set, so change it before running
this anywhere reachable outside your own machine.

**Prometheus login**: none. `:9090` has no authentication at all — anyone
who can reach it can query everything `posts` exports. Fine for local
Docker Compose (same assumption as `POSTGRES_PORT`), but add basic auth
(`--web.config.file`) or a reverse proxy/VPN before exposing it anywhere
less trusted.

## 2. Viewing the Dashboard

[↑ Back to Table of Contents](#table-of-contents)

Grafana → **Dashboards** → **posts — JVM & HTTP overview** (already
provisioned). Six panels: HTTP request rate by status, p50/p95/p99
latency, 5xx error rate, HikariCP active/pending connections, JVM heap
used vs. max, GC pause time.

Generate some traffic first (`curl http://localhost:8080/domains` a few
times) — rate-based panels need at least one 15s scrape interval of data.

## 3. Querying Prometheus Directly

[↑ Back to Table of Contents](#table-of-contents)

Prometheus's UI (<http://localhost:9090/graph>) answers one-off questions
the dashboard doesn't. **One PromQL expression per query box** — pasting
several at once (comments included) parses as a single expression and
fails with `parse error: unexpected <aggr:sum>` on the second query.
Click **+ Add query** for more than one at a time.

Is `posts` up at all?

```promql
up{job="posts"}
```

Request rate per endpoint (not just status, unlike the dashboard panel):

```promql
sum(rate(http_server_requests_seconds_count{job="posts"}[5m])) by (uri, method)
```

Slowest endpoints right now (p99 per URI):

```promql
histogram_quantile(0.99,
  sum(rate(http_server_requests_seconds_bucket{job="posts"}[5m])) by (le, uri))
```

Connection pool headroom:

```promql
hikaricp_connections_active{job="posts"} / hikaricp_connections_max{job="posts"}
```

Heap headroom:

```promql
1 - (jvm_memory_used_bytes{job="posts",area="heap"} / jvm_memory_max_bytes{job="posts",area="heap"})
```

Every metric `posts` exports:
<http://localhost:9090/api/v1/label/__name__/values>, or use autocomplete
in the query box.

## 4. Adding Your Own Metrics

[↑ Back to Table of Contents](#table-of-contents)

HTTP, JVM, and HikariCP metrics are auto-instrumented — free, no code. A
domain-specific counter (e.g. flags created per category) takes a few
lines via the auto-configured `MeterRegistry`:

```java
@Service
@RequiredArgsConstructor
public class PostFlagService {

    private final PostFlagRepository postFlagRepository;
    private final MeterRegistry meterRegistry; // just inject it

    public PostFlag addFlag(Post post, PostType type, int score) {
        PostFlag flag = /* ... existing logic ... */;

        // Tag with values you'll filter/group by in Grafana. Keep
        // cardinality low — never tag with an unbounded ID (user, post):
        // each distinct value becomes its own stored time series.
        meterRegistry.counter("posts.flags.created",
                "domain", post.getDomain().getName(),
                "postType", type.getName())
            .increment();

        return flag;
    }
}
```

Becomes `posts_flags_created_total` in Prometheus (dots → underscores,
counters get a `_total` suffix). Query it like any built-in metric:

```promql
sum(rate(posts_flags_created_total[5m])) by (postType)
```

For timing an operation beyond what `http.server.requests` already
covers, use a `Timer`:

```java
Timer.Sample sample = Timer.start(meterRegistry);
try {
    // ... the operation ...
} finally {
    sample.stop(meterRegistry.timer("posts.ranking.compute", "domain", domainName));
}
```

`@Timed` (`io.micrometer.core.annotation.Timed`) is simpler for a single
method, but needs a `TimedAspect` bean — not registered in this app, so
use the manual `Timer`/`Counter` calls above unless you add one.

No domain-specific metrics exist in the app today — the above is the
pattern to follow when one's actually needed.

## 5. Editing or Extending the Dashboard

[↑ Back to Table of Contents](#table-of-contents)

Provisioned from
[`posts-overview.json`](../../../deploy/docker/grafana/provisioning/dashboards/posts-overview.json)
— Grafana reloads it automatically (`updateIntervalSeconds: 30`) when the
file changes, no restart needed.

- **Edit the JSON directly** — add a panel following the existing shape
  (`datasource: {"type": "prometheus", "uid": "prometheus"}`; that fixed
  `uid` is set in
  [`datasource.yml`](../../../deploy/docker/grafana/provisioning/datasources/datasource.yml)
  so panels don't need a Grafana-generated one).
- **Edit in the Grafana UI**, then copy back: panel menu → **Edit** →
  **Dashboard settings → JSON Model** → paste into `posts-overview.json`.
  UI-only changes don't survive `docker compose down -v` or a fresh clone
  — always land real changes in the file.

## 6. Using It Without Docker

[↑ Back to Table of Contents](#table-of-contents)

Running `posts` directly ([`running-locally.md`](./running-locally.md))?
Management port is still `8081`, on `localhost`:

```bash
curl http://localhost:8081/actuator/health
curl http://localhost:8081/actuator/prometheus | head -30
```

No local Prometheus/Grafana outside Docker here. To scrape this instance
from a standalone Prometheus, point its target at `localhost:8081`
(don't commit that change to `prometheus.yml`) — or from a Dockerized
Prometheus, target `host.docker.internal:8081` (macOS/Windows).

## 7. Troubleshooting

[↑ Back to Table of Contents](#table-of-contents)

- **Grafana panels show "No data"** — check
  <http://localhost:9090/targets> shows `posts` as `UP`. If `DOWN`,
  `posts` is likely still starting (its management port comes up a few
  seconds after the main one) — Prometheus retries every 15s on its own.
- **`up{job="posts"}` returns nothing** — `prometheus` can't resolve
  `posts`: check it's actually running (`docker compose ps`) or crashed
  (`docker compose logs posts`).
- **Rate-based queries return nothing despite target `UP`** —
  `rate()`/`histogram_quantile()` need ≥2 data points in the window; wait
  ~30s or generate traffic first ([§2](#2-viewing-the-dashboard)).
- **Port `3000` or `9090` already in use** — set `GRAFANA_PORT` /
  `PROMETHEUS_PORT` in `.env`.
- **Management port refused from the host** — expected; deliberately not
  published ([`architecture.md` §9.5](./architecture.md#95-observability)).
  Reach it from inside the compose network
  (`docker compose exec prometheus wget -qO- ...` — that image has no
  `curl`) or run `posts` outside Docker instead
  ([§6](#6-using-it-without-docker)).
