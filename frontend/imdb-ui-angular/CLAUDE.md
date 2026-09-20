# CLAUDE.md - Angular Guidelines

## Build & Test Commands
- Run dev server: `ng serve`
- Build project: `ng build`
- Run unit tests: `ng test` / `ng test --watch=false`
- Run e2e tests: `ng e2e`
- Lint code: `ng lint`

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

## RxJS Best Practices
- Always unsubscribe from observables using the `takeUntilDestroyed` operator or the `async` pipe in templates to prevent memory leaks.
- Avoid nested subscriptions; use flattening operators like `switchMap`, `mergeMap`, or `concatMap`.

## Error Handling
- Handle HTTP errors gracefully via interceptors or catchError operators, providing meaningful user feedback.
- Do not leave empty catch blocks in async/await or subscribe error callbacks.
