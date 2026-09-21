# Quickstart

Spin up the full stack in Docker, pre-loaded with mock data for both
domains, and start clicking around in a couple of minutes. For the
system design behind all this, see
[`OVERALL-ARCHITECTURE.md`](OVERALL-ARCHITECTURE.md).

## System Requirements

- **Docker Desktop** (or Docker Engine + the Compose plugin) — this repo
  uses Compose v2 syntax (`docker compose`, no hyphen).
- **A Unix-like shell** — the setup scripts are bash. Native on
  macOS/Linux; use WSL2 on Windows.
- Ports **4200**, **8080**, and **5433** free on the host (overridable
  via `.env` — see [`.env.example`](.env.example)).
- About **1 GB** of free disk for the built images.

**Tested on:** MacBook Pro 16" 2019 (Intel i9-9880H, 8-core/16-thread,
16 GB RAM), macOS 26.5.2, Docker Desktop (Engine 29.8.0, Compose v5.5.1
plugin). Any machine meeting the requirements above should work fine —
this is just what it's been validated against.

## Run It

From the repo root:

```bash
./scripts/docker-run.sh --all
```

`--all` builds and starts every service, then seeds **both** domains
(`imdb/bigotry` and `imdb/standard`) with sample IMDB titles plus mock
users, posts, replies, and flags — no manual data loading needed.

Once it finishes, open **http://localhost:4200**.

> [!WARNING]
> **Use a private/incognito browser window for the best experience.**
> Login and domain selection persist to `localStorage`, so a regular
> window may carry over a session or domain choice from a previous visit
> to this origin. Incognito gives you a clean slate every time — handy
> for switching between `user1`/`user2`/`user3` or between domains.

## Explore

- Pick a domain — **Big-O-Meter** or **Movie-Meter** — from the picker in
  the top-right corner.
- Sign in with one of the pre-seeded mock users — no password needed:
  **`user1`**, **`user2`**, or **`user3`** (each exists separately in
  both domains).
- For a full, screenshot-driven walkthrough of what to do next, see the
  [Angular UI User Guide](frontend/imdb-ui-angular/docs/user-guide.md).

## Shut It Down

```bash
./scripts/docker-shutdown.sh
```
