# Security Considerations

**Scope:** `backend/posts` and `frontend/imdb-ui-angular`, focused on SQL
and script/XSS injection, plus hardening gaps found along the way.
`backend/imdb-data-python` was not reviewed: it's a one-off local loader,
not a network-facing service.
**Last reviewed:** 2026-09-21.

## Table of Contents

- [1. Injection Review (SQL / Script)](#1-injection-review-sql--script)
- [2. Fixed This Review](#2-fixed-this-review)
- [3. Hardening TODO](#3-hardening-todo)
- [4. Related Docs](#4-related-docs)

## 1. Injection Review (SQL / Script)

**Result: no exploitable SQL or script/XSS injection found.**

| Area | What was checked | Finding |
|---|---|---|
| Backend queries | Every `@Query` (7 at review time, in `PostRepository`, `PostFlagRepository`, `ResourceRepository`) | All use named bind parameters. No request data is concatenated into query text. |
| Backend persistence | Any raw `EntityManager`/`JdbcTemplate`/`Statement`/`java.sql` usage | None. All persistence goes through Spring Data JPA. |
| Free-text inputs | `X-Domain` header and `GET /resources?search=&categoryId=`, traced controller → query | Bound as parameters end to end. |
| Frontend | `src/app` grepped for `innerHTML`, `DomSanitizer` bypasses, `eval`, `document.write`, `insertAdjacentHTML`, `outerHTML` | None. All user content (post bodies, usernames, titles) renders through Angular's auto-escaping `{{ }}`. |
| Request headers | `X-Domain`, `X-User-Id` | A fixed option list or a number, never free text. `HttpClient` rejects CRLF in header values anyway. |

## 2. Fixed This Review

**Unescaped `LIKE` wildcards in resource search** (`ResourceRepository.search`).
Not injectable (the term was always bound), but a literal `%` or `_` acted
as a wildcard, so searching `%` matched every resource in the domain.
`ResourceService.escapeLikePattern` now escapes `\`, `%` and `_` before
binding, and the JPQL has a matching `ESCAPE '\'`. Verified on the running
stack: `search=%` returns 0 rows.

## 3. Hardening TODO

Roughly in priority order:

1. **Real authentication.** Login is username-only, with no password or
   token ([`backend/posts/docs/design-spec.md`](backend/posts/docs/design-spec.md#6-open-questions-not-yet-answered--do-not-build-against-these)),
   and a client can claim any `userId` for ownership-checked actions. This
   is the biggest gap; the rest is secondary until it's closed. OAuth2/OIDC
   is the planned direction ([`OVERALL-ARCHITECTURE.md`](OVERALL-ARCHITECTURE.md#6-planned-extensions)).
2. **Minimal application logging.** `GlobalExceptionHandler` now logs
   errors, but there's still no audit trail for auth attempts or abuse.
   Add structured logging around auth and errors, without logging request
   bodies or PII verbatim.
3. **Secrets in source.** The default Postgres password (`P@55w0rd`) is in
   `application.yml`, `docker-compose.yml` and `.env.example`. Fine for
   local dev; never reuse it anywhere reachable. The AWS plan moves it to
   Secrets Manager ([`OVERALL-ARCHITECTURE.md`](OVERALL-ARCHITECTURE.md#5-aws-deployment-feasibility)).
4. **No rate limiting** on login/register lookups or search, so usernames
   can be enumerated.
5. **No TLS.** Compose and local Kubernetes are plain HTTP. TLS only
   appears in the AWS target ([`OVERALL-ARCHITECTURE.md`](OVERALL-ARCHITECTURE.md#5-aws-deployment-feasibility)).
6. **No security response headers.** Neither nginx nor the API sets
   `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`,
   `Referrer-Policy` or `Strict-Transport-Security`.
7. **CSRF protection is disabled.** Deliberate for a stateless JSON API
   with no cookies ([`backend/posts/docs/architecture.md`](backend/posts/docs/architecture.md#92-security--cors));
   revisit once real auth adds a cookie or session.
8. **`/dev/users` is still live.** It's gated by `@Profile("!prod")` and
   documented as temporary, but it's an unauthenticated
   create/list/delete-any-user endpoint. Remove or lock it down before
   exposing the app anywhere real.
9. **Unbounded post/reply bodies.** `bodyText` is `@NotBlank` with no
   `@Size` cap, on a bare `TEXT` column: a minor storage/DoS concern.
10. ~~**No dependency vulnerability scanning.**~~ Done since this review:
    CI (`.github/workflows/quality.yml`) runs `scripts/security-scan.sh`
    (Semgrep + osv-scanner) on every PR.

## 4. Related Docs

| Doc | Relevant to |
|---|---|
| [`backend/posts/docs/design-spec.md`](backend/posts/docs/design-spec.md) | Auth placeholder decision, data model |
| [`backend/posts/docs/architecture.md`](backend/posts/docs/architecture.md) | Error handling, CORS/CSRF posture, REST surface |
| [`frontend/imdb-ui-angular/docs/architecture.md`](frontend/imdb-ui-angular/docs/architecture.md) | Auth flow, runtime config |
| [`OVERALL-ARCHITECTURE.md`](OVERALL-ARCHITECTURE.md) | Planned Identity Provider, AWS TLS/secrets story |
