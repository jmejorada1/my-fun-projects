# Posts Service — Changelog

A dated log of significant spec/decision changes under `docs/`. Entries
point back to the spec where the full detail lives — this file is a log,
not a duplicate of the specs themselves.

## 2026-09-19 — "No Bigotry" post type added to imdb/bigotry

`V16__seed_no_bigotry_post_type.sql` adds a `no-bigotry` row to `post_type`
for the `imdb/bigotry` domain, alongside `racism`/`sexism`/`lgbtq-phobic` —
just data, no schema change (same pattern as `V14`'s domain/category/type
seeding). It's a neutral flag: picking it in the frontend's post form
auto-fills severity to 0 and hides the severity picker entirely, rather
than asking the user to choose a score for a category that only ever means
"no bigotry found" (`resource-detail.component.ts`'s `isNoBigotrySelected`
+ an `effect()` that locks the `score` control to 0 while it's selected).
No backend validation changes — the existing "postTypeId and score must be
provided together" check already accepts any paired values, `0` included.

## 2026-09-19 — `/dev/users` split into login (by username) and register

Full detail: `frontend/imdb-ui-angular/docs/design-spec.md` decision #9,
§3.6, §6 (supersedes decision #4).

- `GET /dev/users/by-username/{username}` (new) — login, 404 if unknown.
- `POST /dev/users` reverted from find-or-create-by-email back to plain
  create, 409 on a duplicate username/email — now backs a dedicated
  Register screen instead of login.
- `AppUserCreateRequest.username` is required again (was optional,
  defaulting to email, only while find-or-create was the login mechanism).
- Frontend: new `/register` route/screen; `login.component` now collects
  a username instead of an email; dashboard gets a top toolbar ("Hi
  &lt;username&gt;" + Logout).
- Deliberately shaped so a future Google identity provider slots into the
  same `AuthService.login`/`register` seam without changing its surface.

## 2026-09-19 — `post_flag.score` widened to allow 0 (neutral)

Full detail: [`implementation-spec-spring-boot.md`](./implementation-spec-spring-boot.md)
§18, [`design-spec.md`](./design-spec.md) decision #12.

- `chk_post_flag_score` widened from `BETWEEN 1 AND 5` to
  `BETWEEN 0 AND 5` (`V15__widen_post_flag_score_range.sql`).
- `PostFlagCreateRequest.score` / `PostCreateRequest.score` validation
  changed from `@Min(1)` to `@Min(0)`.
- No service-layer logic changes — the "postTypeId and score must be
  provided together" check already compared against `null`, not
  truthiness, so `0` was already handled correctly.
- Frontend (`imdb-ui-angular`): the severity `<select>` on the
  resource-detail post form now includes a `0 (Neutral)` option.

## 2026-09-18 — Domain scoping implemented

Full detail: [`implementation-spec-spring-boot.md`](./implementation-spec-spring-boot.md)
§17, [`design-spec.md`](./design-spec.md) decision #11.

- Built all seven anticipated migrations (`V7`–`V13`, see the table below
  from the earlier entry — none of the paths or shapes changed from the
  plan).
- Added `Domain` entity/repository/DTO/mapper/service/controller, following
  the existing per-aggregate conventions.
- Added a plain `domainId` field to `ResourceCategory`, `PostType`,
  `AppUser` (independently settable) and to `Resource`, `Post`, `PostFlag`
  (derived server-side, never from client input).
- Every repository lookup on a domain-owned or domain-derived table became
  domain-scoped; every service method gained a `String domain` parameter
  resolved via a shared `DomainService.requireByName` helper; every
  controller method gained an `X-Domain` header requirement except
  `/domains` itself.
- Updated `PostServiceTest`, `PostFlagRepositoryTest`,
  `ResourceControllerTest`, and `PostsFlowIntegrationTest` for the new
  signatures/header requirement. Full suite (15 tests, including all 13
  migrations against a fresh Testcontainers Postgres) passes.
- **Operational note**: migrations were applied live against the shared
  local dev database (`posts-db`) while an older build of the app was
  already running against it (started outside this session). That old
  process's in-memory entity mappings don't know about the new `domain_id`
  columns, so writes from it will now fail against the `NOT NULL`
  constraints until it's restarted with the current code. Existing data
  was preserved and backfilled to the `imdb` domain; no rows were lost.

## 2026-09-18 — Domain scoping decisions confirmed

Full detail: [`domain-scoping-spec.md`](./domain-scoping-spec.md)

- Introduced a `domain` concept (a lookup table, seeded with `imdb`) so the
  schema can eventually serve multiple, unrelated resource taxonomies
  side by side (e.g. a future `thought-pattern` domain).
- `resource_category`, `post_type`, and `app_user` become directly
  domain-scoped tables — each gets its own `domain_id` FK, and their
  uniqueness constraints (category/type name, username, email) move from
  global to per-domain.
- `resource`, `post`, and `post_flag` get a **derived** `domain_id` — never
  set independently by a client, always resolved server-side and enforced
  via composite FKs — so a resource can never end up in a different domain
  than its category, and a post/flag can never end up in a different
  domain than its resource.
- A post's author must belong to the same domain as the post itself
  (composite FK against `app_user`).
- Requests will carry their domain via an `X-Domain` header (the domain's
  `name`, e.g. `imdb`) rather than a path segment or per-DTO body field.
  Missing header → `400`; unrecognized domain → `404`.
- **Status: all decisions confirmed. Not yet implemented** — no Flyway
  migrations or application code exist for this yet.

### Anticipated Flyway migrations (not yet written)

Sketched here for planning purposes only, following the project's existing
one-change-per-file convention (`implementation-spec-spring-boot.md` §4).
None of these exist yet — nothing below is committed code.

| Migration | Purpose |
|---|---|
| `V7__create_domain_table.sql` | Create `domain`; seed the single `imdb` row |
| `V8__add_domain_to_resource_category.sql` | Add `domain_id`, backfill to `imdb`, add `UNIQUE (domain_id, name)` + `UNIQUE (id, domain_id)`, drop the old global `UNIQUE (name)` |
| `V9__add_domain_to_post_type.sql` | Same shape as V8, for `post_type` |
| `V10__add_domain_to_app_user.sql` | Add `domain_id`, backfill, `UNIQUE (domain_id, username)`, `UNIQUE (domain_id, email)`, `UNIQUE (id, domain_id)`, drop the old global uniques |
| `V11__add_domain_to_resource.sql` | Add derived `domain_id`, backfill from `category_id`, composite FK to `resource_category (id, domain_id)`, `UNIQUE (domain_id, name)` + `UNIQUE (id, domain_id)`, drop the old global `UNIQUE (name)` |
| `V12__add_domain_to_post.sql` | Add derived `domain_id`, backfill from `resource_id`, composite FKs to `resource (id, domain_id)` and `app_user (id, domain_id)`, `UNIQUE (id, domain_id)` |
| `V13__add_domain_to_post_flag.sql` | Add derived `domain_id`, backfill from `post_id`, composite FKs to `post (id, domain_id)` and `post_type (id, domain_id)` |

Every backfill is safe to run as a `NOT NULL`-from-the-start migration
(no nullable transition period) since exactly one domain (`imdb`) exists
today and every existing row belongs to it.
