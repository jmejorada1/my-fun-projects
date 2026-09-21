import { Injectable, inject, signal } from '@angular/core';

/**
 * Default/fallback API base URL — used whenever `/config.json` isn't
 * found (plain `ng serve`, or any test that never triggers
 * loadApiConfig() below — see ApiConfigService) and as every
 * api/*.service.ts test spec's expected request URL. Kept as a named
 * export, unchanged, specifically so those specs need no changes: they
 * never run the app initializer (TestBed doesn't invoke
 * bootstrapApplication's providers), so ApiConfigService.baseUrl() always
 * resolves to exactly this value in a test.
 */
export const API_BASE_URL = 'http://localhost:8080';

/**
 * Runtime-resolved API base URL — every api/*.service.ts reads
 * `apiConfig.baseUrl()` instead of importing API_BASE_URL directly, so
 * one built Docker image can point at any backend URL (local, AWS, ...)
 * via docker-entrypoint.sh generating /config.json from an env var at
 * container *startup*, rather than the URL being baked into the JS bundle
 * at `ng build` time. See loadApiConfig() below.
 */
@Injectable({ providedIn: 'root' })
export class ApiConfigService {
  private readonly baseUrlSignal = signal(API_BASE_URL);
  readonly baseUrl = this.baseUrlSignal.asReadonly();

  /** @internal — called once by loadApiConfig()'s app initializer. */
  setBaseUrl(url: string): void {
    this.baseUrlSignal.set(url);
  }
}

/**
 * App-initializer (registered via provideAppInitializer() in
 * app.config.ts) — fetches /config.json and applies it before the app
 * finishes bootstrapping, so every service's very first HTTP call already
 * uses the right URL. Plain `fetch()` rather than HttpClient specifically
 * to avoid this bootstrap-time request going through
 * domainHeaderInterceptor/errorInterceptor, which have no business
 * touching a same-origin static-file request for app config.
 *
 * Missing or unparseable /config.json (plain `ng serve` with no nginx, or
 * a build that never generates one) — silently keeps API_BASE_URL above,
 * which is what makes local dev need zero setup, same as before this
 * existed.
 */
interface RuntimeApiConfig {
  apiBaseUrl?: string;
}

export function loadApiConfig(): Promise<void> {
  const apiConfig = inject(ApiConfigService);
  return fetch('/config.json')
    .then((res): Promise<RuntimeApiConfig> => (res.ok ? res.json() : Promise.resolve({})))
    .then((config) => {
      if (config.apiBaseUrl) {
        apiConfig.setBaseUrl(config.apiBaseUrl);
      }
    })
    .catch(() => {
      // No /config.json — keep the default API_BASE_URL.
    });
}
