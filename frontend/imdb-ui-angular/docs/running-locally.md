# Running imdb-ui-angular Locally

How to install, run, build, and test this app. See
[`design-spec.md`](./design-spec.md) for what it does and why.

## Prerequisites

- **Node.js 20+** (this was built/tested against Node 24) and npm.
- **The `backend/posts` service running on `http://localhost:8080`**, with
  Flyway migrated through at least `V14` (seeds the `imdb/bigotry` domain
  this app talks to) and CORS configured to allow `http://localhost:4200`
  (`app.cors.allowed-origins` in `backend/posts/src/main/resources/application.yml`
  — already set up). Without it, every screen in this app will show a
  network-error state. See `backend/posts/docs/implementation-spec-spring-boot.md`
  Appendix A, or just run:
  ```bash
  cd backend/posts && ./start-posts-server.sh
  ```
- Angular CLI is used via `npx` below — no global install needed.

## Install dependencies

Only needed once, or after pulling changes that touch `package.json`:

```bash
cd frontend/imdb-ui-angular
npm install
```

## Run the dev server

```bash
npm start
# equivalent to: npx ng serve
```

Open **http://localhost:4200**. The dev server rebuilds and live-reloads
on save. You'll land on `/login` (enter any email — there's no password,
per design-spec.md §6); a successful login redirects to the 3-panel
dashboard at `/`.

## Build for production

```bash
npx ng build
```

Output goes to `dist/imdb-ui-angular/`. This is a static site — the build
artifacts can be served by any static file host; nothing server-side is
needed on the frontend's side.

## Run unit tests

```bash
npm test              # watch mode — reruns on save (default in a TTY)
npx ng test --watch=false   # one-shot run, e.g. for CI or a quick check
```

Runs the full Vitest suite (services, interceptors, the auth guard, and
every component). These are unit tests with `HttpClientTesting` — they
don't need the backend running.

## Configuration

The backend URL and the domain this app operates in are both plain
constants in [`src/app/core/api-config.ts`](../src/app/core/api-config.ts):

```ts
export const API_BASE_URL = 'http://localhost:8080';
export const DOMAIN = 'imdb/bigotry';
```

Change `API_BASE_URL` if the backend runs somewhere other than
`localhost:8080`. There's no separate prod/dev environment file yet — see
the open "deployment target" question in `design-spec.md` §8.

## Troubleshooting

- **Every request fails / "Could not reach the server"** — the backend
  isn't running, or isn't on `http://localhost:8080`. Check
  `API_BASE_URL` above and that `backend/posts` is up.
- **CORS error in the browser console** — the backend's
  `app.cors.allowed-origins` doesn't include the origin you're loading
  this app from (e.g. you're serving it from a different port). Add that
  origin in `backend/posts/src/main/resources/application.yml` and
  restart the backend.
- **`Domain 'imdb/bigotry' not found` (404)** — the backend's database
  hasn't run migration `V14` yet (seeds that domain). Restart
  `backend/posts` so Flyway applies pending migrations, or check
  `flyway_schema_history` is at `v14`+.
- **Dashboard panels show errors/empty even though the backend is up** —
  the `imdb/bigotry` domain has no `resource`/`post`/`post_flag` data of
  its own yet (it's separate from `imdb`'s data). Import some resources
  with `backend/imdb-data-python/import_resources.py --domain "imdb/bigotry"`
  and create posts/flags against them to see the panels populate.
