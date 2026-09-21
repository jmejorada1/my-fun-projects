# imdb-ui-angular — Design Spec

Status: Implemented. Screens, flows, and business rules currently live for
both domains this app serves.
Source: [`requirements-notes.txt`](./requirements-notes.txt) (original raw
draft).

For how the code is structured, see [`architecture.md`](./architecture.md).
For the backend data model these screens render, see
[`backend/posts/docs/design-spec.md`](../../../backend/posts/docs/design-spec.md).
For a screenshot-driven walkthrough written for end users rather than
developers, see [`user-guide.md`](./user-guide.md).

## Table of Contents

- [1. Overview](#1-overview)
- [2. Decision Log](#2-decision-log)
- [3. Screens & Flows](#3-screens--flows)
- [4. Domain-Specific Business Rules](#4-domain-specific-business-rules)
- [5. Non-Goals](#5-non-goals)
- [6. Open Questions](#6-open-questions)

## 1. Overview

[↑ Back to Table of Contents](#table-of-contents)

A single-page UI for the `posts` backend's threaded-post/flag domains,
switchable at runtime via a domain picker ([`architecture.md`](./architecture.md) §4) rather
than being built for one domain. Two domains are live today:
`imdb/bigotry` ("Big-O-Meter" — flags titles for racism/sexism/lgbtq-phobia
with a 0–5 severity score) and `imdb/standard` ("Movie-Meter" — a plain
skip-it/it-was-okay/i-enjoyed-it/i-loved-it rating, no severity).

Three screens: **Login**, **Register**, and a guarded **Dashboard**
(3-panel layout — a user's own posts, search + a resource's detail view,
and top-5 rankings per post type), plus a **Resource Detail** view reached
from search results.

## 2. Decision Log

[↑ Back to Table of Contents](#table-of-contents)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Login and registration are **separate actions, both by username**. Login is a lookup (`404` if unknown); registration is a create (`409` on a duplicate username/email). | Sets up a clean seam for a future real identity provider: register ≈ "create an account," login ≈ "look up an account" — neither changes shape when a real IdP is added later. |
| 2 | **No password/session/token.** The logged-in user's id/username/email lives in a signal, mirrored to `localStorage` so a refresh doesn't log the user out, and is sent as plain `userId`/`username` fields exactly where the backend's DTOs already expect them. | Matches the backend's explicit "not security-enforced" stance ([`backend/posts/docs/architecture.md`](../../../backend/posts/docs/architecture.md) §5) — a fake token would imply more security than actually exists. |
| 3 | Search is **submit-driven, not type-ahead**; matches a resource's `displayName`, case-insensitive, partial. | Explicitly out of scope per the original requirements. |
| 4 | Soft-deleted resources/posts/flags need **no client-side filtering** — the backend already excludes `deletedAt`-set rows from every endpoint this app calls. | Consistent with existing backend behavior, not a new assumption. |
| 5 | The left dashboard panel lists **every post the current user authored** — top-level and replies, across all resources, newest first. | Matches `GET /users/{userId}/posts`. |
| 6 | Rankings (`GET /rankings`, [`architecture.md`](./architecture.md) §6) are **domain-agnostic on the backend** — this app renders whatever post types come back for the active domain rather than hardcoding category names. | Lets a new domain's rankings render correctly with zero frontend code change, same as the backend's own domain-agnostic design. |
| 7 | A `category-only` domain (today: `imdb/standard`) still submits a **fixed constant score** with every flag, since the backend's `post_flag.score` is `NOT NULL`. Ranking order still comes out correct: with every score equal, the backend's `ORDER BY avg_score DESC, flag_count DESC` degrades to ordering by count alone — exactly "counts of the chosen categories." | Avoids a backend schema/query change for this domain; recorded as a deliberate choice per [`backend/posts/CLAUDE.md`](../../../backend/posts/CLAUDE.md)'s "record non-obvious modeling choices" guidance, not a silent assumption. |
| 8 | **Deployment is a static build served by nginx in Docker**, with the backend URL resolved at container *startup* via `/config.json`, not baked in at `ng build` time. | One built image works against any backend without a rebuild — see [`architecture.md`](./architecture.md) §6/§9. |

## 3. Screens & Flows

[↑ Back to Table of Contents](#table-of-contents)

**Login** (`/login`): a username field + submit, plus a link to
`/register`. On submit, looks up the account ([§2](#2-decision-log) decision #1); a `404`
surfaces as "no account found."

**Register** (`/register`): username + email fields + submit, plus a link
back to `/login`. On submit, creates the account and logs it straight in
(no separate "now go log in" step); a `409` surfaces as a field error.

**Dashboard** (`/`, guarded): a toolbar (domain picker, search box, "Hi
`{{username}}`" + Logout) plus a resizable 3-column layout below it.

- **Left — my-posts panel**: every post the current user authored, newest
  first. Empty state: "You haven't posted yet."
- **Center**: a routed child — search results by default
  (`SearchPanelComponent`), or a resource's detail view
  (`ResourceDetailComponent`) after clicking a result.
- **Right — rankings panel**: one ranked list per post type in the active
  domain, each entry showing a resource and its score (average, for a
  `severity-score` domain) or count (for a `category-only` domain).

**Resource Detail** (`/resources/:id`): the resource, its top-level posts
in a sortable/resizable table, and a form to add a new post — optionally
flagged with the active domain's rating in the same submit
(`POST /posts`). Replying, sorting, and column-width preferences are
scoped to this screen; posting or replying notifies the dashboard's
left/right panels to refresh ([`architecture.md`](./architecture.md) §5) without navigating
away.

## 4. Domain-Specific Business Rules

[↑ Back to Table of Contents](#table-of-contents)

Behavior that differs by domain, all driven through `DomainConfig`
([`architecture.md`](./architecture.md) §4) rather than hardcoded — the table below is the
*current* two domains, not an exhaustive list of every field a future
domain could set:

| | `imdb/bigotry` | `imdb/standard` |
|---|---|---|
| Rating input | 0–5 severity score + category | Category only, no score field shown |
| Ranking metric shown | Average severity score | Effectively a count ([§2](#2-decision-log) decision #7) |
| Badge coloring | By severity (green = no-bigotry, yellow → red by score) | By category tier (red → green, worst → best) |
| Conflict-detection dialog | Yes — flagging "no bigotry" against a post that also carries a severe (≥3) flag of another type prompts the user to resolve the contradiction | No — no neutral/contradiction concept for a plain rating |
| Theme | The app's default `:root` colors | Overridden accent + a neutral grey for the "it was okay" tier |

## 5. Non-Goals

[↑ Back to Table of Contents](#table-of-contents)

- **Real authentication** (password, OAuth2/OIDC, tokens) — explicitly
  deferred on the backend already; this app matches that, not ahead of it.
- **Type-ahead search** — explicitly deferred per the original
  requirements.
- **The standalone `login-ui` project** (`frontend/login-ui/`) — still an
  empty, reserved placeholder. This app's login/register screens are a
  stand-in, not a stopgap waiting on that project specifically.
- **A backend schema change for `category-only` domains** — `imdb/standard`
  reuses the existing scored-flag schema via a fixed constant ([§2](#2-decision-log) decision
  #7) rather than the backend growing a nullable-score or "unscored post
  type" concept. Revisit only if a future domain's needs actually require it.

## 6. Open Questions

[↑ Back to Table of Contents](#table-of-contents)

- **Minimum flag-count threshold for rankings** — a resource with a single
  5-scored flag currently outranks one with twenty flags averaging 4.8 in
  a `severity-score` domain's rankings. No threshold is applied unless
  wanted.
