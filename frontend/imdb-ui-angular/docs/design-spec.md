# imdb/bigotry UI — Design & Pre-Implementation Spec (v0.1)

Status: **Proposal — review only. Nothing implemented yet**, per the
request in `requirements-notes.txt`.
Source: [`requirements-notes.txt`](./requirements-notes.txt)
Backend: [`backend/posts`](../../../backend/posts) — REST API this UI
consumes. See `backend/posts/docs/design-spec.md` and
`backend/posts/docs/architecture.md` for what already exists.

## Table of Contents

- [1. Overview](#1-overview)
- [2. Assumptions & Decisions](#2-assumptions--decisions)
- [3. Backend Prerequisites (not yet built)](#3-backend-prerequisites-not-yet-built)
- [4. Angular Architecture](#4-angular-architecture)
- [5. Screens & Components](#5-screens--components)
- [6. Login & Registration Flow](#6-login--registration-flow)
- [7. Phased Implementation Plan](#7-phased-implementation-plan)
- [8. Open Questions](#8-open-questions)
- [9. Non-Goals](#9-non-goals)

## 1. Overview

A deployable Angular UI for the `imdb/bigotry` domain — a rating scheme
that flags movies/shows for bigotry-related content (racism, sexism,
lgbtq-phobia) and lets users discuss them. Three areas on one page:

- **Left panel** — the logged-in user's own posts (top-level and replies).
- **Center** — a submit-style search bar over the resource catalog.
- **Right panel** — top 5 resources per bigotry category, ranked by
  average severity score.

Login is a placeholder: entering an email is enough to identify (or
create) a user — no password, matching the backend's current
not-yet-authenticated `userId` pattern
(`backend/posts/docs/architecture.md` §5). A dedicated
`login-ui` project is planned for later; this one gets its own login
screen for now.

## 2. Assumptions & Decisions

Resolved during review:

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | The UI targets the **`imdb/bigotry` domain** (already created in the database, `domain.id = 51`), sent as `X-Domain: imdb/bigotry` on every backend request. | Confirmed. |
| 2 | "Top 5 per category" ranks by **average severity score** among each resource's active flags of that `post_type`. | Confirmed. |
| 3 | The left panel lists **every post the user authored** — top-level posts and replies alike, across all resources, newest first. | Confirmed. |
| 4 | ~~Login-by-email is implemented as a **find-or-create-by-email** change to the existing `POST /dev/users` backend endpoint~~ — **superseded by decision #9.** | Login and registration are now separate actions; find-or-create no longer applies. |
| 5 | "Programs" in the search requirement means **`resource`** rows (movies/shows) — search matches `display_name`, case-insensitive, partial match. | Not yet asked — reasonable reading of "search all programs," flagging here rather than silently deciding without a paper trail. |
| 6 | No password/session/token. The chosen user's `id`/`email`/`username` is kept client-side (a signal-backed `AuthService`, persisted to `localStorage` so a refresh doesn't log the user out) and sent as `userId`/`username` fields exactly where the backend's existing DTOs already expect them (`X-User-Id` header for deletes, `userId`/`username` body fields for creates). | Matches the backend's explicit "not security-enforced" stance — building a fake token would imply more security than actually exists. |
| 7 | Soft-deleted resources/posts/flags are excluded everywhere (search, panels, top-5) — same as the backend's own `deletedAt` filtering. | Consistent with existing backend behavior; not a new assumption, just stated explicitly. |
| 8 | The rankings endpoint (§3.5) is **`GET /rankings`** — domain-agnostic, no `imdb`/`bigotry` vocabulary in the path. `X-Domain` already scopes which domain's `post_type` rows come back; baking one domain's category names into the URL would contradict the whole point of domain scoping. | Confirmed — replaces the earlier `/resource-categories/bigotry-rankings` placeholder. |
| 9 | **Login and registration are separate actions.** Login identifies by **username** (`GET /dev/users/by-username/{username}`, 404 if unknown — no longer find-or-create). Registration is a new screen collecting **username + email** (`POST /dev/users`, back to plain create, 409 on a duplicate). | Confirmed — supersedes decision #4. Sets up the seam for a future Google identity provider (§6): register ≈ "create account," login ≈ "look up account," neither of which changes shape when a real IdP is added later. |

## 3. Backend Prerequisites (not yet built)

None of this exists yet. **The domain `imdb/bigotry` currently has zero
`resource_category`, `post_type`, `resource`, or `app_user` rows** — the UI
will show nothing until these land, independent of any frontend code.

### 3.1 Seed data for the new domain — **Implemented**

`resource_category` and `post_type` are domain-scoped
(`backend/posts/docs/design-spec.md` decision #11) — `imdb/bigotry` needs
its own rows, not a share of `imdb`'s. Proposed: a new Flyway migration
seeding the same values `imdb` already has (`movie`/`short`/`tvSeries`/...
for categories, `racism`/`sexism`/`lgbtq-phobic` for post types) under
`domain_id = 51`.

### 3.2 `backend/imdb-data-python/import_resources.py` needs a domain fix — **Implemented**

This script predates domain scoping. It currently inserts into `resource`
without a `domain_id` (now `NOT NULL`) and looks up categories with a
plain `WHERE name = ?` (now ambiguous across domains). It needs:
`--domain` config/CLI support, category lookup scoped to
`(domain_id, name)`, and `domain_id` included in the resource insert — the
same shape as `resource_category`'s own domain scoping. Needed before any
`imdb/bigotry` resources can be imported.

### 3.3 New endpoint: search resources — **Implemented**

| Method | Path | Purpose |
|---|---|---|
| GET | `/resources?search=<term>` | Extends the existing `GET /resources` — case-insensitive partial match on `display_name`, paginated same as today, still requires `X-Domain`. |

Proposed: `ResourceRepository.findAllByDomainIdAndDisplayNameContainingIgnoreCaseAndDeletedAtIsNull(...)`,
wired in alongside the existing `categoryId` filter (both optional,
combinable).

### 3.4 New endpoint: a user's posts — **Implemented**

| Method | Path | Purpose |
|---|---|---|
| GET | `/users/{userId}/posts` | Paginated, all posts (top-level + replies) authored by that user in the caller's domain, newest first. |

Proposed: `PostRepository.findByDomainIdAndUserIdAndDeletedAtIsNull(Long domainId, Long userId, Pageable)`.
Ownership isn't checked (same unenforced-`userId` posture as the rest of
the API) — this is a read, and the frontend only ever asks for its own
logged-in user's id.

### 3.5 New endpoint: top 5 resources per post type — **Implemented**

Deliberately domain-agnostic — `X-Domain` already scopes everything, so
nothing here should hardcode `imdb/bigotry`'s specific vocabulary
(`racism`/`sexism`/`lgbtq-phobic` are just *data* returned for that
domain's `post_type` rows, same as any other domain's would be). A domain
with a completely different taxonomy calls the exact same endpoint and
gets back rankings for whatever `post_type` rows it has.

| Method | Path | Purpose |
|---|---|---|
| GET | `/rankings` | For each `post_type` in the caller's domain (per `X-Domain`), the 5 resources with the highest average active-flag score of that type. |

A standalone resource rather than nested under `/post-types` or
`/resource-categories` — it's neither a list of post types nor of
resources, it's its own aggregate view over both, scoped entirely by the
header like every other domain-owned endpoint.

Proposed shape (the frontend already knows `imdb/bigotry`'s post type
names purely because that's the data this returns — the endpoint itself
has no opinion about them):

```json
[
  {
    "postType": { "id": 1, "name": "racism" },
    "resources": [
      { "resource": { "id": 12, "name": "tt0111161", "displayName": "..." },
        "averageScore": 4.5, "flagCount": 8 }
    ]
  }
]
```

Proposed query: group active `post_flag` rows by `(post_type_id,
post_id)`, average `score`, join to `resource` (excluding soft-deleted),
rank per `post_type_id`, take top 5. A resource with a single 5-scored
flag would currently outrank one with twenty flags averaging 4.8 — see §8
for whether a minimum flag-count threshold is wanted.

### 3.6 `/dev/users` split into login and register — **Implemented**

Superseded from an earlier find-or-create-by-email design (decision #4)
to a plain login/register split (decision #9), once a dedicated register
screen made find-or-create unnecessary:

| Method | Path | Purpose |
|---|---|---|
| GET | `/dev/users/by-username/{username}` | Login: look up an existing account by username. `404` if none exists. |
| POST | `/dev/users` | Register: always creates a new account (`username` + `email` both required). `409` on a duplicate username or email. |

### 3.7 CORS — **Implemented**

`SecurityConfig` currently has no CORS configuration. The Angular dev
server (`localhost:4200`) calling the backend (`localhost:8080`) is a
cross-origin request and will be blocked by the browser without one.
Needs a `CorsConfigurationSource` bean permitting the dev origin (and
whatever the deployed UI's origin ends up being).

## 4. Angular Architecture

Per `frontend/imdb-ui-angular/CLAUDE.md`: standalone components, Signals
for local/reactive state, `ChangeDetectionStrategy.OnPush` everywhere,
`takeUntilDestroyed` over manual unsubscribes.

```
src/app
├── core/
│   ├── auth.service.ts          # signal-backed current user, localStorage persistence
│   ├── domain-header.interceptor.ts   # adds X-Domain: imdb/bigotry to every request
│   └── error.interceptor.ts     # maps ProblemDetail errors to user-facing messages
├── api/
│   ├── resource.service.ts      # search, get
│   ├── post.service.ts          # list-by-user, create, reply
│   ├── post-flag.service.ts
│   └── ranking.service.ts       # top-5-per-category
├── features/
│   ├── login/
│   │   └── login.component.ts   # username, links to /register
│   ├── register/
│   │   └── register.component.ts # username + email, links to /login
│   ├── dashboard/
│   │   ├── dashboard.component.ts      # toolbar ("Hi <username>" + Logout) + 3-panel layout shell
│   │   ├── my-posts-panel.component.ts # left
│   │   ├── search-panel.component.ts   # center
│   │   └── rankings-panel.component.ts # right
│   └── ...
└── app.routes.ts                # '/login', '/register' (unauthenticated), '/' (dashboard, guarded)
```

An `authGuard` (functional route guard) redirects to `/login` when
`AuthService.currentUser()` is unset.

## 5. Screens & Components

**Login** (`/login`): a username `<input>` + submit, plus a "New user?
Register" link to `/register`. On submit, calls the username-lookup
endpoint (§3.6), stores the returned user in `AuthService`, navigates to
`/`. A `404` (unknown username) surfaces as "no account found."

**Register** (`/register`): username + email `<input>`s + submit, plus an
"Already have an account? Log in" link back to `/login`. On submit, calls
the create endpoint (§3.6); success logs the new account straight in
(stores it in `AuthService`, same as login) and navigates to `/` — no
separate "now go log in" step. A `409` (duplicate username or email)
surfaces as a field error.

**Dashboard** (`/`, guarded): a top toolbar plus a 3-column CSS grid below it.

- **Toolbar**: "Hi `{{ username }}`" in the top-right, plus a **Logout**
  link that calls `AuthService.logout()` and navigates to `/login`.
- **Left — `my-posts-panel`**: calls §3.4 with the current user's id.
  Each row: resource title, post excerpt, timestamp. Empty state: "You
  haven't posted yet."
- **Center — `search-panel`**: a text input + submit button (no
  type-ahead, per the requirement). On submit, calls §3.3, renders a
  result list (title, category, a way to navigate into the resource to
  post/reply — exact resource-detail view is a later phase, see §7).
- **Right — `rankings-panel`**: calls §3.5 once on load, renders one
  ranked list per bigotry category (racism / sexism / lgbtq-phobic),
  each showing resource title + average score.

## 6. Login & Registration Flow

**Login**:

1. User enters a username, submits.
2. `AuthService.login(username)` calls `GET /dev/users/by-username/{username}`.
3. On success, the response (`{ id, username, email, ... }`) is stored in
   a signal and mirrored to `localStorage` under a single key. On a `404`,
   the login screen shows "no account found with that username."

**Register**:

1. User enters a username and email, submits.
2. `AuthService.register(username, email)` calls `POST /dev/users` with
   `{ username, email }`.
3. On success, the created account is stored the same way login stores
   one (auto-login after registering) and the app navigates to `/`. On a
   `409`, the register screen shows the backend's conflict message.

Both flows share the same storage mechanism in `AuthService`; only how
the `AuthUser` is *obtained* (lookup vs. create) differs. On app
bootstrap, `AuthService` reads `localStorage` to restore the session
without a network call.

Every subsequent API call includes `id`/`username`/`email` exactly where
the target DTO already expects a `userId`/`username` field — no token, no
`Authorization` header, matching the backend's current security posture
(decision #6). This split is deliberately shaped so a future Google
identity provider slots in cleanly: **register** becomes "create an
account after Google confirms an email," **login** becomes "look up the
account for the Google-confirmed identity" — the `AuthService` surface
(`login`/`register`/`logout`/`currentUser`) doesn't need to change shape,
only what's inside those two methods.

## 7. Phased Implementation Plan

Each phase is independently testable before starting the next.

**Phase 0 — Backend prerequisites** (`backend/posts`, `backend/imdb-data-python`)
Everything in §3. Testable via `curl`/Postman without any Angular code:
seed data present, search/ranking/user-posts endpoints return real data,
CORS allows a browser origin, `/dev/users` is idempotent by email.

**Phase 1 — App shell + login**
Angular project scaffold, routing, `AuthService`, `authGuard`, the login
screen. Testable: entering an email lands on an empty dashboard shell;
refreshing the page keeps you logged in; a second login with the same
email doesn't create a duplicate user (verify against Phase 0's backend).

**Phase 2 — Search panel**
`ResourceService.search`, `search-panel` component. Testable
independently of the other two panels: typing a term and submitting shows
matching resources; no results renders an empty state; a failed request
shows an error via the error interceptor.

**Phase 3 — My-posts panel**
`PostService.listByUser`, `my-posts-panel` component. Testable: a user
with existing posts (seeded via backend curl calls) sees them listed; a
new user sees the empty state.

**Phase 4 — Rankings panel**
`RankingService`, `rankings-panel` component. Testable against
Phase 0's seeded flag data: three ranked lists render with correct
ordering by average score.

**Phase 5 — Layout & polish**
Assemble the 3-column dashboard, responsive behavior, loading states,
consistent error presentation across all three panels. Testable
end-to-end: log in, search, see your posts, see rankings, all on one
screen.

Posting/replying/flagging *from* the UI (vs. just viewing) isn't scoped
in the original requirements — noted as a likely Phase 6 if wanted, not
assumed here.

## 8. Open Questions

- **§3.5 minimum flag-count threshold** — should a resource need at least
  N active flags of a type to be eligible for its top-5, so a single
  5-scored flag can't outrank a heavily-flagged resource with a slightly
  lower average? No threshold is applied unless you want one.
- **Resource detail / posting UI** — search results need *some* next step
  (view a resource's thread, post, reply, flag) for the app to be more
  than read-only, but that's not in the original requirements list. Is
  that in scope for this pass, or a follow-up?
- **Deployment target** — "a deployable UI" is mentioned but no target
  (static hosting? behind the same origin as the backend? a specific
  environment?) is specified yet; affects the CORS origin list in §3.7
  and any build/environment config.

## 9. Non-Goals

- Real authentication (password, OAuth2/OIDC, tokens) — explicitly
  deferred on the backend already; this UI matches that, not ahead of it.
- Type-ahead search — explicitly deferred per the requirements notes.
- The standalone `login-ui` project — out of scope here; this spec's
  login screen is a temporary stand-in inside `imdb-ui-angular` itself,
  per the requirements notes.
