# imdb-ui-angular — Design Spec

**Status:** Implemented for both domains. **Source:**
[`requirements-notes.txt`](./archived/requirements-notes.txt) (original draft).

Code structure: [`architecture.md`](./architecture.md). Backend data
model: [`backend/posts/docs/design-spec.md`](../../../backend/posts/docs/design-spec.md).
End-user walkthrough: [`user-guide.md`](./user-guide.md).

## Table of Contents

- [1. Overview](#1-overview)
- [2. Decision Log](#2-decision-log)
- [3. Screens & Flows](#3-screens--flows)
- [4. Domain-Specific Business Rules](#4-domain-specific-business-rules)
- [5. Non-Goals](#5-non-goals)
- [6. Open Questions](#6-open-questions)

## 1. Overview

A single-page UI for the `posts` backend, switchable at runtime between
domains ([`architecture.md` §4](./architecture.md#4-domain-configuration-system)):

- `imdb/bigotry` ("Big-O-Meter"): flag titles for racism, sexism or
  LGBTQ+-phobia with a 0–5 severity.
- `imdb/standard` ("Movie-Meter"): a plain skip-it / it-was-okay /
  i-enjoyed-it / i-loved-it rating, no severity.

Screens: **Login**, **Register**, and a guarded 3-panel **Dashboard** (my
posts, search or resource detail, top-5 rankings per post type). **Resource
Detail** opens from a search result.

## 2. Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Login and registration are **separate actions, both by username**. Login looks up (`404` if unknown); register creates (`409` on a duplicate username/email). | A clean seam for a real IdP later: register = create an account, login = look one up. Neither changes shape. |
| 2 | **No password, session or token.** The user's id/username/email sits in a signal mirrored to `localStorage` (survives refresh) and is sent as plain `userId`/`username` fields where backend DTOs expect them. | Matches the backend's "not security-enforced" stance ([backend §5](../../../backend/posts/docs/architecture.md#5-rest-api-surface)). A fake token would imply security that doesn't exist. |
| 3 | Search is **submit-driven, not type-ahead**: case-insensitive partial match on `displayName`. | Type-ahead was out of scope in the original requirements. |
| 4 | **No client-side filtering of soft-deleted rows.** | The backend already excludes rows with `deletedAt` set from every endpoint this app calls. |
| 5 | The left panel lists **every post the user authored**: top-level and replies, all resources, newest first. | Matches `GET /users/{userId}/posts`. |
| 6 | Rankings (`GET /rankings`) are **domain-agnostic**: the app renders whatever post types the backend returns for the active domain. | A new domain's rankings render with no frontend change. |
| 7 | A `category-only` domain (today `imdb/standard`) sends a **fixed constant score** with every flag, since `post_flag.score` is `NOT NULL`. With equal scores, the backend's `ORDER BY avg_score DESC, flag_count DESC` reduces to ordering by count, which is what this domain wants. | No backend schema or query change. Recorded per [`backend/posts/CLAUDE.md`](../../../backend/posts/CLAUDE.md)'s "record non-obvious modeling choices." |
| 8 | **Static build served by nginx in Docker**, with the backend URL read from `/config.json` at container startup, not baked in at `ng build`. | One image works against any backend ([`architecture.md` §6](./architecture.md#6-api-layer--runtime-configuration), [§9](./architecture.md#9-deployment)). |

## 3. Screens & Flows

**Login** (`/login`): username + submit, and a link to `/register`. Looks
up the account (decision #1); `404` shows "no account found."

**Register** (`/register`): username + email + submit, and a link back to
`/login`. Creates the account and logs straight in; `409` shows as a field
error.

**Dashboard** (`/`, guarded): a toolbar (domain picker, search box, "Hi
`{{username}}`", Logout) over a resizable 3-column layout:

- **Left, my posts:** everything the user authored, newest first. Empty
  state: "You haven't posted yet."
- **Center:** a routed child: search results (`SearchPanelComponent`) by
  default, or a resource's detail (`ResourceDetailComponent`) after a
  click.
- **Right, rankings:** one ranked list per post type in the active domain,
  each entry showing a resource with its average score (`severity-score`)
  or count (`category-only`).

**Resource Detail** (`/resources/:id`): the resource, its top-level posts
in a sortable, resizable table, and a form to add a post, optionally
flagged with the domain's rating in the same submit (`POST /posts`).
Replying, sorting and column widths are local to this screen. Posting or
replying tells the side panels to refresh
([`architecture.md` §5](./architecture.md#5-state-management)) without
navigating away.

## 4. Domain-Specific Business Rules

All driven by `DomainConfig`
([`architecture.md` §4](./architecture.md#4-domain-configuration-system)).
This covers the current two domains, not every field a future one could
set.

| | `imdb/bigotry` | `imdb/standard` |
|---|---|---|
| Rating input | 0–5 severity score + category | Category only, no score field |
| Ranking metric | Average severity | Effectively a count (decision #7) |
| Badge coloring | By severity: green = no-bigotry, yellow → red by score | By tier: red → green, worst → best |
| Conflict dialog | Yes: flagging "no bigotry" on a post that also has a severe (≥3) flag of another type asks the user to resolve it | No: a plain rating has no neutral/contradiction concept |
| Theme | The app's default `:root` colors | Overridden accent, plus neutral grey for "it was okay" |

## 5. Non-Goals

- **Real authentication** (passwords, OAuth2/OIDC, tokens): deferred on the
  backend, and this app doesn't get ahead of it.
- **Type-ahead search:** deferred by the original requirements.
- **A standalone login app:** not started. These login/register screens
  are a stand-in, not a stopgap waiting on it.
- **A backend schema change for `category-only` domains:** `imdb/standard`
  reuses the scored-flag schema with a fixed score (decision #7). Revisit
  only if a future domain needs a nullable score or unscored post types.

## 6. Open Questions

- **Minimum flag count for rankings.** In a `severity-score` domain, a
  resource with one flag scored 5 outranks one with twenty flags averaging
  4.8. No threshold is applied unless one is wanted.
