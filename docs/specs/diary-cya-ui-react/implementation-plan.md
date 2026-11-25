# CYA Diary (React) — Implementation Plan

**Spec:** [spec.md](spec.md)  ·  **Date:** 2026-11-24  ·  **Status:** Draft, for Phase 1 of the spec only

This plan splits the spec's Phase 1 tasks
([T1–T17](spec.md#6-implementation-tasks)) into eight phases. Each phase
is one branch and one PR. It is tested on its own, merges to `main`, and
leaves the stack working, so the work can stop after any phase without
leaving anything half built.

The phases are vertical slices. The first two make the stack safe for
real data. After that, each phase adds one feature end to end, from
`posts` through to the diary UI. Real entries can be logged from
[Phase 4](#phase-4-log-entries-and-the-timeline) on. The design (what to
build) is in the spec. This plan covers the order, what each phase
proves, and how to check it.

## Phase overview

| Phase | Adds | Spec tasks | posts | Migration | Real use |
|---|---|---|---|---|---|
| [1. Localhost-only stack](#phase-1-localhost-only-stack) | Every published port bound to `127.0.0.1` | [T7](spec.md#6-implementation-tasks) (part), [T6](spec.md#6-implementation-tasks) (part) | No | — | — |
| [2. Backups and wipe guard](#phase-2-backups-and-wipe-guard) | `db-backup.sh`, `db-restore.sh`, the wipe guard | [T8, T9](spec.md#6-implementation-tasks) | No | — | — |
| [3. Domain, scaffold and login](#phase-3-domain-scaffold-and-login) | `diary/cya` domain, the React app, login | [T1, T10, T16](spec.md#6-implementation-tasks), parts of [T7, T11, T17](spec.md#6-implementation-tasks) | Seed only | `V19` | — |
| [4. Log entries and the timeline](#phase-4-log-entries-and-the-timeline) | Log, list, filter and delete entries | Parts of [T11–T14, T17](spec.md#6-implementation-tasks) | No | — | **Starts** (append-only) |
| [5. Editing and history](#phase-5-editing-and-history) | Editable `data`, revisions, entry detail | [T3](spec.md#6-implementation-tasks), parts of [T6, T11, T14, T15](spec.md#6-implementation-tasks) | Yes | `V20` | Edits leave history |
| [6. Responses and tags](#phase-6-responses-and-tags) | Responses, tag groups, status, outcomes, lessons | Parts of [T11–T15](spec.md#6-implementation-tasks) | No | — | Full entry model, responses tracked |
| [7. Screenshots](#phase-7-screenshots) | Attachments in the API and the UI | [T4, T5](spec.md#6-implementation-tasks), parts of [T6, T11, T13–T15](spec.md#6-implementation-tasks) | Yes | `V21` | Evidence |
| [8. People and rename](#phase-8-people-and-rename) | People pages with counts and lessons, renaming a person | [T2](spec.md#6-implementation-tasks), parts of [T11, T15, T17](spec.md#6-implementation-tasks) | Yes | — | Phase 1 complete |

[Task coverage](#task-coverage) shows where each part of every spec task
lands, so nothing falls between phases.

## Rules for every phase

**Deployable means:**

- `./scripts/quality-gate.sh` passes (85% of changed lines covered) and
  `./scripts/security-scan.sh` is clean, locally and in CI.
- `./scripts/docker-run.sh` brings the whole stack up, and the phase's
  manual checks pass on it.
- The Angular app still works: its tests pass, and a post can be
  created, edited and deleted on `http://localhost:${FRONTEND_PORT}`.
- `./scripts/k8s-verify-static.sh` still passes.
- The docs the phase changes are updated in the same PR (listed per
  phase).

**Across phases:**

- **Data written by one phase must load in every later one.** The
  entry schema ([§4.4](spec.md#44-entry-and-response-schemas)) is fixed
  at `schemaVersion: 1` from [Phase 4](#phase-4-log-entries-and-the-timeline),
  with every entry field. Later phases add the `response` kind, but
  never change or rename an entry field. The response schema is fixed
  the same way from [Phase 6](#phase-6-responses-and-tags), with
  `outcome` and `nextTime`, so later charts
  ([§4.11](spec.md#411-future-visualizing-incidents-and-responses)) can
  read every response ever logged.
- **Migrations are forward-only.** `V19`–`V21` are claimed by this plan,
  since the diary goes before quit-habit ([Q11](spec.md#q11)). Rolling a
  phase back means reverting the PR's code; a migration that has run
  stays, and must be harmless to the code before it (new tables and a
  defaulted column are).
- **Tick a spec task in [spec.md](spec.md#6-implementation-tasks) only
  when its last part lands.** Split tasks name their phases in
  [Task coverage](#task-coverage).
- **No real entries before [Phase 4](#phase-4-log-entries-and-the-timeline)
  ships**, and not until its [real-use checkpoint](#real-use-checkpoint)
  passes.

---

### Phase 1: Localhost-only stack

**Goal:** close the LAN to the API, Postgres and Grafana for the whole
stack ([N1](spec.md#2-requirements-traceability),
[§4.8](spec.md#48-running-it-safely-with-real-data)). Useful on its own,
since Postgres is published today on every interface with a committed
password.

**Changes**

- `docker-compose.yml`: every published port becomes
  `"${BIND_ADDRESS:-127.0.0.1}:<host port>:<container port>"`
  (`postgres`, `posts`, `frontend`, `prometheus`, `grafana`).
- `.env.example`: `BIND_ADDRESS`, with a note that `0.0.0.0` restores
  LAN access.
- `SECURITY-CONSIDERATIONS.md`: record the LAN exposure and the fix
  (the LAN part of [T6](spec.md#6-implementation-tasks)).
- Root `README.md`: mention `BIND_ADDRESS` where ports are described.

**Automated tests**

- `docker compose config` renders, and every `published` port has
  `host_ip: 127.0.0.1`.
- `bash -n` on any script touched.

**Manual checks**

1. `./scripts/docker-run.sh`, then open the Angular app, the API's
   Swagger UI and Grafana on `localhost`. All work.
2. From another device on the same network, the laptop's LAN IP on
   `API_PORT`, `POSTGRES_PORT` and `GRAFANA_PORT` refuses the
   connection.
3. Prometheus still shows the `posts` target as up (container-to-container
   traffic is unaffected).
4. With `BIND_ADDRESS=0.0.0.0` in `.env`, step 2 connects again. Set it
   back.

**Done when:** no port is reachable from the LAN by default.

---

### Phase 2: Backups and wipe guard

**Goal:** a dev wipe can't destroy real data, and a backup can be
restored exactly ([N2](spec.md#2-requirements-traceability),
[Q5](spec.md#q5), [Q6](spec.md#q6)). This lands before any diary data exists.

**Changes**

- `scripts/db-backup.sh` and `scripts/db-restore.sh`, as in
  [§4.8](spec.md#48-running-it-safely-with-real-data):
  `pg_dump -Fc` into `BACKUP_DIR`, mode `600`, newest 10 kept; restore
  asks for confirmation.
- `scripts/lib-db.sh` with the guard, called from
  `docker-shutdown.sh --all` and `docker-hard-clean.sh` (so also
  `docker-clean-rebuild.sh`). Both take `--force`.
- The guard counts posts by joining `domain` on `name = 'diary/cya'`,
  so it reads 0 while the domain doesn't exist yet, and behaves as
  today.
- `.env.example`: `BACKUP_DIR`.
- Root `README.md` and root `CLAUDE.md` script list: the new scripts and
  `--force`.

**Automated tests**

- `bash -n` on every new and changed script; `--help` works on each.

**Manual checks**

1. Seed IMDB data, run `db-backup.sh`, check the file is in `BACKUP_DIR`
   with mode `600`.
2. Run it 11 times: only the newest 10 remain.
3. `docker-shutdown.sh --all` wipes as before (no diary posts yet, so no
   backup, no prompt change).
4. With Postgres stopped, `docker-shutdown.sh --all` refuses; with
   `--force` it proceeds.
5. Restore the backup from step 1 after a wipe: post counts and a few
   posts' `created_at` match what they were.

The guard's "diary posts exist" path can't be checked until
[Phase 4](#phase-4-log-entries-and-the-timeline), which re-runs it.

**Done when:** a backup restores exactly, and a wipe with Postgres down
needs `--force`.

---

### Phase 3: Domain, scaffold and login

**Goal:** the diary app runs in the stack, and a user can log in to the
`diary/cya` domain. Nothing to record yet.

**Changes, posts**

- `V19__seed_diary_cya_domain.sql`: domain `diary/cya`, display name
  `CYA Diary`, categories `work`, `family`, `friends`, `other`
  ([T1](spec.md#6-implementation-tasks), [§4.3](spec.md#43-domain-mapping)).

**Changes, running it**

- The diary parts of [T7](spec.md#6-implementation-tasks):
  `diary-ui` compose service on `DIARY_UI_PORT` (default 4300,
  [Q9](spec.md#q9)) behind `BIND_ADDRESS`; `DIARY_UI_PORT` in
  `.env.example`; `APP_CORS_ALLOWED_ORIGINS` as a comma-separated list of
  both UI origins; the port in `docker-precheck.sh` and the printed URLs;
  a `diary` target in `docker-reload.sh`.

**Changes, diary UI**

- Scaffold `frontend/diary-cya-ui-react` with the
  [Q10](spec.md#q10) stack: React, strict TypeScript, Vite, React
  Router, Vitest, React Testing Library, plain `fetch`, CSS modules
  ([T10](spec.md#6-implementation-tasks)).
- Dockerfile: Node build stage, then `nginx:alpine`, non-root. An
  entrypoint writes `/config.json` from `API_BASE_URL`.
- API layer, first part ([T11](spec.md#6-implementation-tasks)): the
  request helper (`X-Domain: diary/cya`, `X-User-Id`, `ProblemDetail`
  to message), config loading, and users.
- Log in screen: find by username or register, user kept in
  `localStorage`. An empty timeline page as home.

**Changes, quality and docs**

- `scripts/quality-gate.sh`: component `diary-ui`, with Vitest coverage
  as Cobertura. `.github/workflows/quality.yml`: `npm ci` and tests for
  the new app ([T16](spec.md#6-implementation-tasks)).
- App `CLAUDE.md`, a first app `README.md`, root `CLAUDE.md` component
  table and "What this is", and the new `.claude/rules/` file for
  rendering user content in the React apps (parts of
  [T17](spec.md#6-implementation-tasks)). The rule lands before any
  screen renders user text.

**Automated tests**

- posts, Testcontainers: `V19` applies after `V18` and its rows exist.
- UI: config loading; the request helper sends `X-Domain` and
  `X-User-Id`, maps a `ProblemDetail`; the app renders the login
  screen; login and register paths.
- `docker compose config` renders; precheck checks port 4300.

**Manual checks**

1. `./scripts/docker-run.sh`. The diary is on
   `http://localhost:4300`, the Angular app still on 4200.
2. Register a user in the diary. In dev tools, requests carry
   `X-Domain: diary/cya`.
3. The Angular app's calls still pass CORS.
4. `./scripts/docker-reload.sh diary` rebuilds only the diary.
5. A trial run of `quality-gate.sh` that touches only the diary app
   gates `diary-ui`.

**Done when:** both UIs run side by side and the gate covers the new
app.

---

### Phase 4: Log entries and the timeline

**Goal:** log an incident in seconds and find it again
([R1–R4](spec.md#2-requirements-traceability),
[A1–A5](spec.md#81-suggestions)). Entries are append-only in this phase:
no editing (it would leave no history until
[Phase 5](#phase-5-editing-and-history)), but soft delete with a warning
([Q4](spec.md#q4)) is the way to fix a mistake.

**Changes, diary UI**

- `diary-schema.ts`, entry part ([T12](spec.md#6-implementation-tasks)):
  parse and serialize every entry field in
  [§4.4](spec.md#44-entry-and-response-schemas) at `schemaVersion: 1`,
  categories, settings, sources, severity 1 to 5. Unknown kinds are
  ignored, so later responses won't break this version.
- API layer: resources (list every page, search, create), posts (create,
  list every page by user, delete).
- Log entry screen ([T14](spec.md#6-implementation-tasks), without
  screenshots or "My response"): quick capture with the three required
  fields; the "What happened" and "Effect on me" groups; person picker
  with inline add and the `-2`, `-3` slug retry; `occurredAt` defaulting
  to now.
- Timeline ([T13](spec.md#6-implementation-tasks), without tag, status
  and evidence): newest first by `occurredAt`; person, setting,
  categories, severity; "logged N days later"; "needs details";
  filters by person, context, category and date range; text search;
  delete with the warning.
- App `README.md`: the "Using it for real" checklist
  ([A16](spec.md#81-suggestions)) and backup and restore steps.

No `posts` changes.

**Automated tests**

- Schema: round trip; unknown `kind` ignored; missing optional fields;
  unknown `schemaVersion` handled; out-of-range severity rejected.
- API layer: paging loads every page.
- Forms: saves with only the three required fields; a slug conflict
  retries with a suffix.
- Timeline: filters combine; "logged N days later" only for a gap of a
  day or more; "needs details" badge; an entry containing `<script>`
  renders as text.

**Manual checks**

1. Log an entry with only the required fields, then a full one
   back-dated two days. Both appear, the second with "logged 2 days
   later".
2. Every screen at phone width.
3. Delete an entry: the warning appears, the entry leaves the timeline.
4. Re-run [Phase 2](#phase-2-backups-and-wipe-guard)'s guard with diary
   posts present: `docker-shutdown.sh --all` backs up first, then wipes.
   Restore, and every entry's recorded-at time matches.

#### Real-use checkpoint

Start logging real incidents only when all of these hold:

- [ ] [Phase 1](#phase-1-localhost-only-stack) and
      [Phase 2](#phase-2-backups-and-wipe-guard) are merged, and their
      checks pass on this laptop.
- [ ] Step 4 above passes.
- [ ] The README checklist is done: personal device, FileVault on,
      `POSTGRES_PASSWORD` set in `.env` before the volume was created
      (or the volume recreated after setting it), `BACKUP_DIR` outside
      the repo.

Until [Phase 7](#phase-7-screenshots), keep screenshots in a private
folder and attach them then. Their upload time will be later than the
entry's, which the UI shows honestly.

**Done when:** an entry can be logged, found by filter, and survives a
wipe and restore.

---

### Phase 5: Editing and history

**Goal:** entries can be edited and every edit leaves the old version
behind ([N3](spec.md#2-requirements-traceability),
[§4.6](spec.md#46-editable-data-and-revision-history)).

**Changes, posts** ([T3](spec.md#6-implementation-tasks))

- `V20__create_post_revision_table.sql`: `post_revision`, and
  `post.revision INTEGER NOT NULL DEFAULT 1`.
- `PostUpdateRequest.data` (`null` keeps, `{}` clears, replaces whole);
  revisions recorded in `PostService.update` only when something
  changes; `revision` on `PostResponse`; `GET /posts/{postId}/revisions`;
  the 32 KB `data` cap on create and PATCH.
- Docs: `backend/posts/docs/architecture.md`
  [REST surface](../../../backend/posts/docs/architecture.md#5-rest-api-surface)
  and data model, and `design-spec.md` tables and ER diagram (the
  revisions part of [T6](spec.md#6-implementation-tasks)).

**Changes, diary UI**

- API layer: PATCH with `bodyText` and `data`, revisions.
- Edit mode on the entry form.
- Entry detail ([T15](spec.md#6-implementation-tasks), without
  responses and screenshots): every field, recorded-at next to
  occurred-at, and a History list of earlier versions showing what
  changed.

**Automated tests**

- posts: every [T3](spec.md#6-implementation-tasks) test, including the
  Angular-style PATCH (`userId`, `bodyText`) and 404 for another
  domain's post. Testcontainers: `V20` applies; PATCH and revisions end
  to end.
- UI: history lists earlier versions; an edit sends the whole `data`.

**Manual checks**

1. Edit an entry twice. History shows two earlier versions, newest
   first, with what changed.
2. Save without changing anything: no new version.
3. Edit a post in the Angular app: still works, and its `data` is kept.
4. Entries logged in [Phase 4](#phase-4-log-entries-and-the-timeline)
   open and edit normally (they start at revision 1).

**Done when:** no edit can be made without leaving the earlier version.

---

### Phase 6: Responses and tags

**Goal:** log my own actions and reactions to an incident, tagged and
grouped, and track how each one went so I respond better next time
([R7, R9](spec.md#2-requirements-traceability),
[D5–D8](spec.md#decisions-already-made-by-the-user-2026-11-23),
[Q19](spec.md#q19), [A7](spec.md#81-suggestions)). Replies and their
revisions already exist in `posts`, so this phase is UI only.

**Changes, diary UI**

- `diary-schema.ts`, response part: the `response` kind, tag
  normalization, the starter tags with their groups, `tagGroups`, and
  the reflection fields `outcome` and `nextTime`
  ([§4.4](spec.md#44-entry-and-response-schemas)). Groups come only from
  the tags that use them; there is no group management
  ([Q20](spec.md#q20)).
- API layer: replies (create, list).
- Entry detail: responses with tags, status, `reportedTo`, outcome and
  "next time"; "Add response"; edit a response, with its own history,
  which is how an outcome known only later gets added.
- Log entry: the "My response" group, saved as the first response, with
  a retry that keeps the entry if that save fails. The Lessons panel:
  once a person is picked, the newest five outcomes and "next time"
  notes from responses to earlier entries where they were primary or
  involved.
- Tag picker: each group shown apart; adding a tag asks for its group
  (built-in, existing, or new); a reused tag suggests its last group.
  Chips show their group's color, a + or − for positive and negative,
  and the group's name in the tooltip and accessible label.
- Timeline: status, response tags, and filters for tag, outcome and
  status.

**Automated tests**

- Schema: every tag test in [T12](spec.md#6-implementation-tasks)
  (normalizing "Hard work!" to `hard-work`, duplicates, 32 characters,
  10 per response, starter groups, `tagGroups` round trip); an unknown
  `outcome` and a `nextTime` over 1,000 characters are rejected.
- Entry status comes from the latest response that has one, by
  `occurredAt`, else `open`.
- The tag picker and chip tests in [T15](spec.md#6-implementation-tasks);
  adding an outcome to an existing response records a revision; "My
  response" saved as the first response; the Lessons panel shows the
  newest five for the picked person and nothing for a new one; the tag
  and outcome filters combine with the others.

**Manual checks**

1. Add three responses to an entry: one tagged `anger`, one with a new
   tag in a new group, one with status `reported`. The timeline shows
   `reported` and the three tags in their groups' colors.
2. Edit a response; its History shows the earlier version.
3. Use the new tag again: the picker suggests the group it was saved
   with.
4. A day later, edit the `anger` response to add outcome `made-worse`
   and a "next time" note. History shows the version without them.
5. Log a new entry about the same person: the Lessons panel shows that
   note and outcome.

**Done when:** every response field in
[§4.4](spec.md#44-entry-and-response-schemas) can be logged, edited and
filtered on, and past lessons show when logging a new incident.

---

### Phase 7: Screenshots

**Goal:** attach screenshots as evidence, stored byte for byte with
their SHA-256 ([R5, N3](spec.md#2-requirements-traceability),
[§4.5](spec.md#45-attachments), [Q3](spec.md#q3)).

**Changes, posts** ([T4, T5](spec.md#6-implementation-tasks))

- `V21__create_post_attachment_table.sql`, the `PostAttachment` entity,
  and a repository with a metadata projection that never loads
  `content`.
- `AttachmentService` and `AttachmentController`: the five endpoints,
  magic-byte allowlist (PNG, JPEG, WebP), 10 MB and 10 per post, author
  check, soft delete, download headers.
- Multipart limits in `application.yml`; `MaxUploadSizeExceededException`
  to a 413 in `GlobalExceptionHandler`.
- Docs: the attachments part of [T6](spec.md#6-implementation-tasks),
  and the upload review in `SECURITY-CONSIDERATIONS.md`.

**Changes, diary UI**

- API layer: upload (multipart), list, list by user, fetch to a blob
  URL that's revoked on unmount, delete.
- Entry form and "Add response": file picker, drag and drop, and paste
  ([A6](spec.md#81-suggestions)), with a retry that keeps the entry if an
  upload fails.
- Entry detail: screenshots with hash and upload time.
- Timeline: evidence count, and the "has evidence" filter.

**Automated tests**

- posts: every [T5](spec.md#6-implementation-tasks) test, and
  Testcontainers for `V21`, the byte-for-byte round trip and the
  projection.
- UI: multipart body built; blob URLs revoked; paste adds a screenshot;
  a failed upload offers a retry and keeps the entry.

**Manual checks**

1. Paste a screenshot (Ctrl+Shift+Cmd+4) into a new entry and save. The
   hash in the UI matches `shasum -a 256` of the original file.
2. An SVG and a renamed text file are refused; an 11th file is refused.
3. Downloading a screenshot shows `nosniff` and `no-store` in dev tools.
4. Backup, wipe and restore: attachment hashes, revisions and
   recorded-at times all match (the full [T8](spec.md#6-implementation-tasks)
   round trip).

**Done when:** a screenshot can be attached, viewed, verified by hash,
and survives a restore.

---

### Phase 8: People and rename

**Goal:** see everything about one person, and fix a mistyped name
([R1](spec.md#2-requirements-traceability), [Q2](spec.md#q2)). Completes
Phase 1 of the spec.

**Changes, posts** ([T2](spec.md#6-implementation-tasks))

- `PATCH /resources/{id}`: `displayName` only, `@NotBlank`, up to 512,
  scoped to the domain. Docs: REST surface.

**Changes, diary UI**

- API layer: rename a resource.
- People page ([T15](spec.md#6-implementation-tasks)): grouped by
  context; each person's page lists the entries they appear in (as
  primary, involved, witness or source) and counts by category,
  severity, my response tags and outcomes over time, plus a Lessons
  section with every "next time" note from entries where they're
  primary or involved. The counting is plain TypeScript with no React,
  so a later mobile client
  ([§4.10](spec.md#410-future-mobile-client)) and the later charts
  ([§4.11](spec.md#411-future-visualizing-incidents-and-responses)) can
  reuse it.
- Rename from the person's page.
- Docs, the rest of [T17](spec.md#6-implementation-tasks): root
  `README.md` and
  [`OVERALL-ARCHITECTURE.md`](../../../OVERALL-ARCHITECTURE.md#2-container-topology)
  (the diary UI service and the new `posts` features).

**Automated tests**

- posts: renames; blank or over 512 characters is 400; another domain's
  resource is 404.
- UI: a person's page includes entries where they're involved, a
  witness or the source; counts my response tags and outcomes; lists
  lessons only from entries where they're primary or involved.

**Manual checks**

1. Rename a person: the new name shows on every entry, and existing
   entries are untouched (they hold the ID).
2. A person who is only a witness on one entry lists that entry.
3. Every screen at phone width.

**Done when:** every [T1–T17](spec.md#6-implementation-tasks) box in the
spec is ticked.

---

## Task coverage

Where each part of every spec task lands.

| Spec task | Phases |
|---|---|
| [T1](spec.md#6-implementation-tasks) Domain seed | [3](#phase-3-domain-scaffold-and-login) |
| [T2](spec.md#6-implementation-tasks) Rename a resource | [8](#phase-8-people-and-rename) |
| [T3](spec.md#6-implementation-tasks) Editable `data`, revisions | [5](#phase-5-editing-and-history) |
| [T4, T5](spec.md#6-implementation-tasks) Attachments | [7](#phase-7-screenshots) |
| [T6](spec.md#6-implementation-tasks) posts and security docs | LAN exposure [1](#phase-1-localhost-only-stack); revisions [5](#phase-5-editing-and-history); attachments and upload review [7](#phase-7-screenshots); rename [8](#phase-8-people-and-rename) |
| [T7](spec.md#6-implementation-tasks) Compose, `.env`, CORS, precheck | `BIND_ADDRESS` [1](#phase-1-localhost-only-stack); `BACKUP_DIR` [2](#phase-2-backups-and-wipe-guard); `diary-ui`, `DIARY_UI_PORT`, CORS, precheck [3](#phase-3-domain-scaffold-and-login) |
| [T8, T9](spec.md#6-implementation-tasks) Backups, wipe guard | [2](#phase-2-backups-and-wipe-guard); re-checked with diary data in [4](#phase-4-log-entries-and-the-timeline) and [7](#phase-7-screenshots) |
| [T10](spec.md#6-implementation-tasks) Scaffold | [3](#phase-3-domain-scaffold-and-login) |
| [T11](spec.md#6-implementation-tasks) API layer | helper, users [3](#phase-3-domain-scaffold-and-login); resources, posts [4](#phase-4-log-entries-and-the-timeline); PATCH, revisions [5](#phase-5-editing-and-history); replies [6](#phase-6-responses-and-tags); attachments [7](#phase-7-screenshots); rename [8](#phase-8-people-and-rename) |
| [T12](spec.md#6-implementation-tasks) `diary-schema.ts` | entry [4](#phase-4-log-entries-and-the-timeline); response and tags [6](#phase-6-responses-and-tags) |
| [T13](spec.md#6-implementation-tasks) Login, Timeline | login [3](#phase-3-domain-scaffold-and-login); timeline [4](#phase-4-log-entries-and-the-timeline); tag, outcome and status [6](#phase-6-responses-and-tags); evidence [7](#phase-7-screenshots) |
| [T14](spec.md#6-implementation-tasks) Log and edit entry | create [4](#phase-4-log-entries-and-the-timeline); edit [5](#phase-5-editing-and-history); "My response", Lessons panel [6](#phase-6-responses-and-tags); screenshots [7](#phase-7-screenshots) |
| [T15](spec.md#6-implementation-tasks) Entry detail, People | detail and history [5](#phase-5-editing-and-history); responses, tags and reflections [6](#phase-6-responses-and-tags); screenshots [7](#phase-7-screenshots); People, with outcomes and lessons [8](#phase-8-people-and-rename) |
| [T16](spec.md#6-implementation-tasks) Quality gate, CI | [3](#phase-3-domain-scaffold-and-login) |
| [T17](spec.md#6-implementation-tasks) Docs | app `CLAUDE.md`, root `CLAUDE.md`, `.claude/rules/` [3](#phase-3-domain-scaffold-and-login); README checklist and backups [4](#phase-4-log-entries-and-the-timeline); root `README.md`, `OVERALL-ARCHITECTURE.md` [8](#phase-8-people-and-rename) |

## After Phase 1

### Visualizing incidents and responses

Designed in
[§4.11](spec.md#411-future-visualizing-incidents-and-responses), with no
phase yet ([D9](spec.md#decisions-already-made-by-the-user-2026-11-23)).
It needs no new data: [Phase 6](#phase-6-responses-and-tags) and
[Phase 8](#phase-8-people-and-rename) store and count everything the
views use. It gets its own plan once its open points (first views, the
"in the moment" cut-off, a chart library) are settled.

### The LLM summary

The spec's Phase 2 ([§4.9](spec.md#49-phase-2-llm-summary-design-only),
[T18–T21](spec.md#6-implementation-tasks)) gets its own plan once
Phase 1 here is done. Two notes for it:

- [Q13](spec.md#q13) (where the LLM call lives) is unanswered, so its
  default applies: `POST /summaries` in `posts`. Confirm it before
  planning.
- Per [Q16](spec.md#q16)'s answer, the summary starts as one request
  that waits, but must be easy to make asynchronous later. Keep the work
  in a service that takes a slice and returns a stored summary, with the
  controller as a thin synchronous wrapper. A later job endpoint with
  polling, Server-Sent Events or a WebSocket then calls the same
  service, and the stored summary ([Q15](spec.md#q15)) is what a job
  would hand back.
- The consent screen gets a second unticked checkbox, for reflections
  (`outcome`, `nextTime`), next to the one for tags
  ([D10](spec.md#decisions-already-made-by-the-user-2026-11-23)).
