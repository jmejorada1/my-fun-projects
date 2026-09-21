import { InjectionToken } from '@angular/core';
import { DOMAIN_REGISTRY } from './domain/domain-registry';

export interface DomainOption {
  /** Actual X-Domain header value sent to the backend. */
  value: string;
  /** User-facing name shown in the domain picker. */
  label: string;
  /** False for a domain that's been named but has no backend data/seeding yet. */
  enabled: boolean;
  /** One-line, user-facing explanation of what this domain is — shown on login/register. */
  description: string;
}

/**
 * Derived from DOMAIN_REGISTRY (core/domain/domain-registry.ts) — picker
 * metadata lives on each domain's DomainConfig now, so adding a domain
 * never means editing this file (docs/architecture.md §4).
 * The backend's actual domain names (`imdb/bigotry`, `imdb/standard`) are
 * internal — the picker shows each config's friendly `label` instead.
 */
export const DOMAIN_OPTIONS: readonly DomainOption[] = DOMAIN_REGISTRY.map(
  ({ value, label, description, enabled }) => ({ value, label, description, enabled }),
);

export const DEFAULT_DOMAIN = DOMAIN_OPTIONS[0].value;

/** DI seam so tests can substitute a different option set. */
export const DOMAIN_OPTIONS_TOKEN = new InjectionToken<readonly DomainOption[]>('DOMAIN_OPTIONS', {
  providedIn: 'root',
  factory: () => DOMAIN_OPTIONS,
});
