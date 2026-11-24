---
paths:
  - "frontend/imdb-ui-angular/src/**"
---

# Angular UI: SOLID

Apply these where they pay off. KISS still wins (see the root
[Design principles](../../CLAUDE.md#design-principles)): don't add a
class, token or layer just to satisfy a principle.

- **Single responsibility.** Components handle view state and user
  events; business rules and data access live in services. Only the
  `api/` services and `AuthService` call `HttpClient`. Split a component
  or service you can't describe without "and" into child components, a
  directive (like those in `shared/`) or a service.
- **Open/closed.** What differs between domains lives in each domain's
  `DomainConfig` (see
  [Domain configuration](../../frontend/imdb-ui-angular/CLAUDE.md#domain-configuration-coredomain)).
  Never `if`/`switch` on a domain key outside `core/domain/`.
- **Liskov.** No class inheritance for components, directives or
  services; share behavior through a service, a directive or a plain
  function. Extend only built-ins such as `Error` (as `AppHttpError`
  does), and keep their contract.
- **Interface segregation.** A service keeps its writable signals
  private and exposes `asReadonly()` signals, plus named methods that
  change them (see `AuthService`). Other classes read that state; only
  the owning service writes it.
- **Dependency inversion.** Use `inject()` in a field initializer (or
  inside the function, for interceptors, guards and factories), not
  constructor parameters. Get configuration through DI
  (`DOMAIN_OPTIONS_TOKEN`, `ApiConfigService`), and keep no mutable
  module-level variables. Services are concrete `providedIn: 'root'`
  classes, not an abstract class with a single implementation. Tests
  stub HTTP with `provideHttpClientTesting()` and can swap a service
  with `{ provide: X, useValue }`, so testability isn't a reason to add
  one.
