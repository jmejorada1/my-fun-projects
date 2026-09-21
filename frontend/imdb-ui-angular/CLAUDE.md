# CLAUDE.md - Angular Guidelines

For backend-dependency setup and troubleshooting, see
[`docs/running-locally.md`](docs/running-locally.md). For screens, flows,
and business-rule decisions, see
[`docs/design-spec.md`](docs/design-spec.md). For how the code is
structured, including how a domain's rating behavior/skin is configured,
see [`docs/architecture.md`](docs/architecture.md). For an end-user's
walkthrough of the app itself (with screenshots), see
[`docs/user-guide.md`](docs/user-guide.md).

## Build & Test Commands
- Run dev server: `ng serve`
- Build project: `ng build`
- Run unit tests: `ng test` / `ng test --watch=false`
- Run a single spec: `ng test --include=<path-to-spec-file>`

**No `ng lint` or `ng e2e` target exists in this project** — don't assume
either is configured; check `angular.json`'s `architect` keys before
relying on one. The test runner is **Vitest** (`@angular/build:unit-test`
builder — note the "RUN v4.x" banner, not Karma/Jasmine's), so specs use
Vitest's API (`vi.fn()`, `vi.spyOn()`, `vi.useFakeTimers()`), not
`jasmine.createSpy()`.

## Architecture & Code Style
- **Standalone Components:** Prefer standalone components, directives, and pipes over NgModules.
- **Signals:** Use Angular Signals (`signal`, `computed`, `effect`) for local and reactive state management where appropriate, balancing with RxJS for asynchronous streams.
- **OnPush Change Detection:** Use `ChangeDetectionStrategy.OnPush` for all components.
- **Templates:** Keep templates clean. Avoid complex logic in templates; use component methods or computed signals instead.
- **Naming Conventions:**
  - Components: `*.component.ts` (kebab-case file names, PascalCase class names)
  - Services: `*.service.ts`
  - Directives: `*.directive.ts`
  - Pipes: `*.pipe.ts`

### Domain configuration (`core/domain/`)

Everything about a domain's *behavior* (rating mode — severity-score vs.
category-only, badge coloring, skin/theme tokens, optional business-rule
hooks like bigotry's no-bigotry conflict dialog) lives in one
`DomainConfig` object per domain, under `core/domain/configs/`, registered
in `core/domain/domain-registry.ts`. `domain-options.ts` (picker
label/description/enabled) is *derived* from that registry, not
hand-maintained — adding a domain means one new config file + one line in
the registry, not edits scattered across components. Full design and
rationale: [`docs/architecture.md`](docs/architecture.md) §4. Components read the
active domain's config via `DomainSelectionService.activeDomainConfig()`,
not by importing domain-specific constants directly.

### API base URL is resolved at runtime, not baked in at build time

`core/api-config.ts`'s `ApiConfigService` — every `api/*.service.ts`
injects it and reads `apiConfig.baseUrl()`, not a hardcoded constant. The
actual URL comes from `/config.json`, generated at *container startup* by
`docker-entrypoint.sh` from the `API_BASE_URL` env var (see
`docker-compose.yml`), fetched via a `provideAppInitializer` in
`app.config.ts` before the app finishes bootstrapping. This is what lets
one built Docker image point at any backend URL without a rebuild. In
tests, this app initializer never runs (TestBed doesn't invoke
`bootstrapApplication`'s providers), so `ApiConfigService.baseUrl()`
always resolves to the `API_BASE_URL` constant's default value — specs
that assert against that constant need no special setup.

## RxJS Best Practices
- Always unsubscribe from observables using the `takeUntilDestroyed` operator or the `async` pipe in templates to prevent memory leaks.
- Avoid nested subscriptions; use flattening operators like `switchMap`, `mergeMap`, or `concatMap`.

## Error Handling
- Handle HTTP errors gracefully via interceptors or catchError operators, providing meaningful user feedback.
- Do not leave empty catch blocks in async/await or subscribe error callbacks.
