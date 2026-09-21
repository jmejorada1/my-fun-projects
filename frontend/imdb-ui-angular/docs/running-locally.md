# Running imdb-ui-angular Locally

How to install, run, build, and test this app. See
[`architecture.md`](./architecture.md) for how it's structured and
[`design-spec.md`](./design-spec.md) for what it does and why.

## Table of Contents

- [1. Prerequisites](#1-prerequisites)
- [2. Install Dependencies](#2-install-dependencies)
- [3. Run the Dev Server](#3-run-the-dev-server)
- [4. Build for Production](#4-build-for-production)
- [5. Run Unit Tests](#5-run-unit-tests)
- [6. Configuration](#6-configuration)
- [7. Troubleshooting](#7-troubleshooting)

## 1. Prerequisites

[↑ Back to Table of Contents](#table-of-contents)

- **Node.js 20+** (this was built/tested against Node 24) and npm.
- **The `backend/posts` service running on `http://localhost:8080`**, with
  Flyway migrated through at least `V17` (seeds both `imdb/bigotry` and
  `imdb/standard` — the two domains this app's picker offers) and CORS
  configured to allow `http://localhost:4200`
  (`app.cors.allowed-origins` in `backend/posts/src/main/resources/application.yml`
  — already set up). Without it, every screen in this app will show a
  network-error state. See
  [`backend/posts/docs/running-locally.md`](../../../backend/posts/docs/running-locally.md),
  or just run:
  ```bash
  cd backend/posts && ./start-posts-server.sh
  ```
- Angular CLI is used via `npx` below — no global install needed.

## 2. Install Dependencies

[↑ Back to Table of Contents](#table-of-contents)

Only needed once, or after pulling changes that touch `package.json`:

```bash
cd frontend/imdb-ui-angular
npm install
```

## 3. Run the Dev Server

[↑ Back to Table of Contents](#table-of-contents)

```bash
npm start
# equivalent to: npx ng serve
```

Open **http://localhost:4200**. The dev server rebuilds and live-reloads
on save. You'll land on `/login` — pick a domain from the toolbar's
picker, then either log in with an existing username or follow the
"Register" link (username + email, no password —
[`design-spec.md`](./design-spec.md) §2 decisions #1–#2). A successful login/registration
redirects to the 3-panel dashboard at `/`.

## 4. Build for Production

[↑ Back to Table of Contents](#table-of-contents)

```bash
npx ng build
```

Output goes to `dist/imdb-ui-angular/browser/`. This is a static site —
see [`architecture.md`](./architecture.md) §9 for how the Docker image
serves it and resolves the backend URL at container startup.

## 5. Run Unit Tests

[↑ Back to Table of Contents](#table-of-contents)

```bash
npm test              # watch mode — reruns on save (default in a TTY)
npx ng test --watch=false   # one-shot run, e.g. for CI or a quick check
```

Runs the full Vitest suite (services, interceptors, the auth guard, and
every component). These are unit tests with `HttpClientTesting` — they
don't need the backend running.

## 6. Configuration

[↑ Back to Table of Contents](#table-of-contents)

There's no build-time domain constant — which domain is active is a
runtime choice made in the toolbar's picker (persisted to `localStorage`),
not a config file edit. See [`architecture.md`](./architecture.md) §4.

The backend base URL defaults to the constant in
[`src/app/core/api-config.ts`](../src/app/core/api-config.ts):

```ts
export const API_BASE_URL = 'http://localhost:8080';
```

For plain `ng serve`, that's the only URL this app will use — edit it
directly if your backend runs somewhere else. In the Docker build, this
default is overridden at *container startup* instead
([`architecture.md`](./architecture.md) §6/§9), so you don't need to touch
this file for that path.

## 7. Troubleshooting

[↑ Back to Table of Contents](#table-of-contents)

- **Every request fails / "Could not reach the server"** — the backend
  isn't running, or isn't on `http://localhost:8080`. Check
  `API_BASE_URL` above and that `backend/posts` is up.
- **CORS error in the browser console** — the backend's
  `app.cors.allowed-origins` doesn't include the origin you're loading
  this app from (e.g. you're serving it from a different port). Add that
  origin in `backend/posts/src/main/resources/application.yml` and
  restart the backend.
- **A domain 404s / errors as soon as you pick it** — the backend's
  database hasn't run that domain's seed migration yet (`V14` for
  `imdb/bigotry`, `V17` for `imdb/standard`). Restart `backend/posts` so
  Flyway applies pending migrations, or check `flyway_schema_history`.
- **Dashboard panels show errors/empty even though the backend is up** —
  the selected domain has no `resource`/`post`/`post_flag` data of its own
  yet (each domain's data is separate). Import resources with
  `backend/imdb-data-python/import_resources.py --domain "imdb/bigotry"`
  (or `"imdb/standard"`) and create posts/flags against them, or run the
  Docker mock-data loaders described in the root
  [`README.md`](../../../README.md) to see the panels populate.
