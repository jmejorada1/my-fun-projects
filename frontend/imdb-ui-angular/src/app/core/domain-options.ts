import { InjectionToken } from '@angular/core';
import { DOMAIN_REGISTRY } from './domain/domain-registry';

export interface DomainOption {
  /** The X-Domain header value. */
  value: string;
  label: string;
  /** False shows the domain in the picker without making it selectable. */
  enabled: boolean;
  description: string;
}

export const DOMAIN_OPTIONS: readonly DomainOption[] = DOMAIN_REGISTRY.map(
  ({ value, label, description, enabled }) => ({ value, label, description, enabled }),
);

export const DEFAULT_DOMAIN = DOMAIN_OPTIONS[0].value;

/** Lets tests substitute their own options. */
export const DOMAIN_OPTIONS_TOKEN = new InjectionToken<readonly DomainOption[]>('DOMAIN_OPTIONS', {
  providedIn: 'root',
  factory: () => DOMAIN_OPTIONS,
});
