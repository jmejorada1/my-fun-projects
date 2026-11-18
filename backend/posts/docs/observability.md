# Observability — Using Micrometer, Prometheus, and Grafana

Day-to-day use of the metrics stack. *Why* it's wired this way:
[`architecture.md` §9.5](./architecture.md#95-observability). *How* the
pipeline works:
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

```bash
./scripts/docker-run.sh   # prometheus + grafana start with everything else
```

| Component | URL | Use |
|---|---|---|
| Grafana | <http://localhost:3000> | Dashboards |
| Prometheus | <http://localhost:9090> | Ad hoc PromQL; scrape health under **Status → Targets** |
| `posts` `/actuator/prometheus` | Not published to the host ([§9.5](./architecture.md#95-observability)) | Raw metrics, scraped every 15s ([§6](#6-using-it-without-docker) shows direct access) |

**Grafana login:** `admin` / `admin` unless `GRAFANA_ADMIN_PASSWORD` is set
in `.env` ([`.env.example`](../../../.env.example)). When that variable is
set, Grafana doesn't force a password change, so set a real one before
running this anywhere but your machine.

**Prometheus has no login.** Anyone who can reach `:9090` can query all of
`posts`' metrics. Fine locally (same assumption as `POSTGRES_PORT`); add
basic auth (`--web.config.file`) or a proxy/VPN before exposing it.

## 2. Viewing the Dashboard

Grafana → **Dashboards** → **posts — JVM & HTTP overview** (provisioned).
Six panels: request rate by status, p50/p95/p99 latency, 5xx rate,
HikariCP active/pending connections, JVM heap used vs. max, GC pause
time.

Generate traffic first (`curl http://localhost:8080/domains` a few times);
rate panels need at least one 15s scrape of data.

## 3. Querying Prometheus Directly

Use <http://localhost:9090/graph> for questions the dashboard doesn't
answer. **One expression per query box.** Pasting several (or comments)
fails with `parse error: unexpected <aggr:sum>`; use **+ Add query**
instead.

| Question | PromQL |
|---|---|
| Is `posts` up? | `up{job="posts"}` |
| Request rate per endpoint | `sum(rate(http_server_requests_seconds_count{job="posts"}[5m])) by (uri, method)` |
| Slowest endpoints (p99 per URI) | `histogram_quantile(0.99, sum(rate(http_server_requests_seconds_bucket{job="posts"}[5m])) by (le, uri))` |
| Connection pool usage | `hikaricp_connections_active{job="posts"} / hikaricp_connections_max{job="posts"}` |
| Heap headroom | `1 - (jvm_memory_used_bytes{job="posts",area="heap"} / jvm_memory_max_bytes{job="posts",area="heap"})` |

All exported metric names:
<http://localhost:9090/api/v1/label/__name__/values>, or use autocomplete.

## 4. Adding Your Own Metrics

HTTP, JVM and HikariCP metrics come free. No domain-specific metrics exist
yet; when one is needed, inject the auto-configured `MeterRegistry`:

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

In Prometheus this becomes `posts_flags_created_total` (dots become
underscores; counters get `_total`):

```promql
sum(rate(posts_flags_created_total[5m])) by (postType)
```

To time an operation beyond `http.server.requests`, use a `Timer`:

```java
Timer.Sample sample = Timer.start(meterRegistry);
try {
    // ... the operation ...
} finally {
    sample.stop(meterRegistry.timer("posts.ranking.compute", "domain", domainName));
}
```

`@Timed` is simpler for one method but needs a `TimedAspect` bean, which
this app doesn't register. Use the manual calls unless you add one.

## 5. Editing or Extending the Dashboard

The dashboard is provisioned from
[`posts-overview.json`](../../../deploy/docker/grafana/provisioning/dashboards/posts-overview.json);
Grafana reloads it within 30s of a change (`updateIntervalSeconds: 30`),
no restart.

- **Edit the JSON:** copy an existing panel's shape. Use
  `datasource: {"type": "prometheus", "uid": "prometheus"}`; that fixed uid
  comes from
  [`datasource.yml`](../../../deploy/docker/grafana/provisioning/datasources/datasource.yml).
- **Edit in the UI, then copy back:** panel menu → **Edit**, then
  **Dashboard settings → JSON Model**, and paste into
  `posts-overview.json`. UI-only changes are lost on `docker compose down
  -v` or a fresh clone.

## 6. Using It Without Docker

When running `posts` directly ([`running-locally.md`](./running-locally.md)),
the management port is still `8081`:

```bash
curl http://localhost:8081/actuator/health
curl http://localhost:8081/actuator/prometheus | head -30
```

There's no Prometheus/Grafana outside Docker here. To scrape this instance,
point a standalone Prometheus at `localhost:8081`, or a Dockerized one at
`host.docker.internal:8081` (macOS/Windows). Don't commit that change to
`prometheus.yml`.

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Panels show "No data" | Check <http://localhost:9090/targets> shows `posts` `UP`. If `DOWN`, `posts` is probably still starting (the management port comes up a few seconds after the app); Prometheus retries every 15s. |
| `up{job="posts"}` returns nothing | Prometheus can't resolve `posts`. Check it's running (`docker compose ps`) or crashed (`docker compose logs posts`). |
| Rate queries empty although target is `UP` | `rate()`/`histogram_quantile()` need two or more points in the window. Wait ~30s or generate traffic ([§2](#2-viewing-the-dashboard)). |
| Port `3000` or `9090` in use | Set `GRAFANA_PORT` / `PROMETHEUS_PORT` in `.env`. |
| Management port refused from the host | Expected: it's not published ([§9.5](./architecture.md#95-observability)). Use `docker compose exec prometheus wget -qO- ...` (the image has no `curl`), or run `posts` outside Docker ([§6](#6-using-it-without-docker)). |
