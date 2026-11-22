import { Injectable, inject, signal } from '@angular/core';

/** Used when /config.json is absent (`ng serve`, tests). Specs expect this URL. */
export const API_BASE_URL = 'http://localhost:8080';

/** Resolved at startup from /config.json, so one image can target any backend. */
@Injectable({ providedIn: 'root' })
export class ApiConfigService {
  private readonly baseUrlSignal = signal(API_BASE_URL);
  readonly baseUrl = this.baseUrlSignal.asReadonly();

  setBaseUrl(url: string): void {
    this.baseUrlSignal.set(url);
  }
}

interface RuntimeApiConfig {
  apiBaseUrl?: string;
}

/** App initializer. Uses fetch(), not HttpClient, to bypass the app's interceptors. */
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
