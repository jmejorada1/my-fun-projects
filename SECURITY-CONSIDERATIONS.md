# Security Considerations

**Scope of this review:** `backend/posts` and `frontend/imdb-ui-angular`
only, focused on SQL and script/XSS injection, plus other hardening gaps
noticed along the way. `backend/imdb-data-python` was **not** reviewed —
it's a one-off local data-loading tool, not a network-facing service.
**Last reviewed:** 2026-09-21.

## Table of Contents

- [1. Injection Review (SQL / Script)](#1-injection-review-sql--script)
- [2. Fixed This Review](#2-fixed-this-review)
- [3. Hardening TODO](#3-hardening-todo)
- [4. Related Docs](#4-related-docs)

## 1. Injection Review (SQL / Script)

**Method:** every `@Query` in `backend/posts` (7, across
`PostRepository`/`PostFlagRepository`/`ResourceRepository`) checked for
parameterization; confirmed zero raw `EntityManager`/`JdbcTemplate`/
`Statement`/`java.sql` usage anywhere in the codebase; the two most
attacker-reachable free-text surfaces — the `X-Domain` header and
`GET /resources?search=&categoryId=` — traced end to end from controller
to query. On the frontend, the entire `src/app` tree grepped for
`innerHTML`, every `DomSanitizer` bypass method, `eval`, `document.write`,
`insertAdjacentHTML`, and `outerHTML`.

**Result: no exploitable SQL injection or script/XSS injection found.**

- **Backend** — every JPQL/native query uses named bind parameters
  exclusively; nothing concatenates request data into query text. No raw
  JDBC/`EntityManager` usage exists at all — all persistence goes through
  Spring Data JPA.
- **Frontend** — no `innerHTML`, no sanitizer bypass, no `eval`/
  `document.write`/`insertAdjacentHTML` anywhere. Every piece of
  user-controlled content (post bodies, usernames, resource titles) is
  rendered exclusively through Angular's auto-escaping `{{ }}`
  interpolation.
- HTTP header construction (`X-Domain`, `X-User-Id`) is either restricted
  to a fixed option list or a numeric value — not attacker-controllable
  free text — and browser `HttpClient` rejects CRLF in header values
  regardless.

## 2. Fixed This Review

- **Unescaped SQL `LIKE` wildcards in resource search**
  (`ResourceRepository.search`) — not SQL-injectable (the search term was
  always a bind parameter, never concatenated), but a literal `%` or `_`
  in someone's search text acted as a wildcard instead of a literal
  character — e.g. searching `%` matched *every* resource in a domain.
  Fixed by escaping `\`, `%`, `_` in the search term
  (`ResourceService.escapeLikePattern`) before it's bound, with a
  matching `ESCAPE '\'` clause added to the JPQL. Verified against the
  running stack: `search=%` now returns `0` results instead of every row.

## 3. Hardening TODO

Not injection-specific, but these are the gaps most worth closing next,
roughly in priority order:

1. **Real authentication.** Login is username-only — no password or
   token (`backend/posts/docs/design-spec.md` §2/§6) — and a client can
   claim any `userId` in request bodies for ownership-checked actions.
   This is the single biggest gap; everything else here is secondary
   until it's closed. An Identity Provider (OAuth2/OIDC) is already the
   stated direction ([`OVERALL-ARCHITECTURE.md`](OVERALL-ARCHITECTURE.md) §6).
2. **No application logging.** Confirmed zero SLF4J/`Logger` usage
   anywhere in `backend/posts` — no audit trail for auth attempts, no
   visibility into abuse or errors once this runs anywhere but a laptop.
   Add structured logging, especially around auth and error paths,
   without logging request bodies or other PII verbatim.
3. **Secrets checked into source.** The default Postgres password
   (`P@55w0rd`) is hardcoded in `application.yml`/`docker-compose.yml`/
   `.env.example`. Fine for local dev; must not be reused anywhere
   reachable — [`OVERALL-ARCHITECTURE.md`](OVERALL-ARCHITECTURE.md) §5
   already calls for Secrets Manager instead.
4. **No rate limiting.** Login/register lookups and search have no
   throttling — open to username enumeration and basic abuse.
5. **No TLS anywhere in the current setup.** Local Docker Compose is
   plain HTTP end to end; TLS only appears in the AWS target
   architecture ([`OVERALL-ARCHITECTURE.md`](OVERALL-ARCHITECTURE.md) §5),
   not today's stack.
6. **No security response headers.** Neither the nginx frontend nor the
   Spring Boot API set `Content-Security-Policy`,
   `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, or
   `Strict-Transport-Security`.
7. **CSRF protection is disabled.** Deliberate for now — a stateless
   JSON API with no cookies
   ([`backend/posts/docs/architecture.md`](backend/posts/docs/architecture.md) §9.2)
   — but worth revisiting the moment real auth introduces a
   cookie/session.
8. **`/dev/users` is still live.** Profile-gated (`@Profile("!prod")`)
   and already documented as temporary, but it's an open, unauthenticated
   create/list/delete-any-user endpoint — a reminder it must be removed
   (or genuinely locked down) before this is exposed anywhere real.
9. **Unbounded post/reply body size.** `bodyText` has `@NotBlank` but no
   `@Size` cap, and the column is a bare `TEXT` — a large payload is a
   minor storage/DoS-adjacent concern, not an injection one.
10. **No dependency vulnerability scanning.** No `npm audit`/OWASP
    dependency-check/Snyk step exists because no CI pipeline exists yet
    at all — [`OVERALL-ARCHITECTURE.md`](OVERALL-ARCHITECTURE.md) §5
    step 7 already calls for adding one.

## 4. Related Docs

| Doc | Relevant to |
|---|---|
| [`backend/posts/docs/design-spec.md`](backend/posts/docs/design-spec.md) | Auth placeholder decision, data model |
| [`backend/posts/docs/architecture.md`](backend/posts/docs/architecture.md) | Error handling, CORS/CSRF posture, REST surface |
| [`frontend/imdb-ui-angular/docs/architecture.md`](frontend/imdb-ui-angular/docs/architecture.md) | Auth flow, runtime config |
| [`OVERALL-ARCHITECTURE.md`](OVERALL-ARCHITECTURE.md) | Planned Identity Provider, AWS TLS/secrets story |
