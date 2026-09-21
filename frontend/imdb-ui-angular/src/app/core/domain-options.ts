import { InjectionToken } from '@angular/core';

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
 * The backend's actual domain names (`imdb/bigotry`, `imdb/standard`) are
 * internal — the picker shows a friendly label instead. `movie-meter`
 * (imdb/standard) is listed but disabled: it doesn't exist in the backend
 * yet, this just reserves its spot in the UI.
 */
export const DOMAIN_OPTIONS: readonly DomainOption[] = [
  {
    value: 'imdb/bigotry',
    label: 'Big-O-Meter',
    enabled: true,
    description:
      'Flags movies, TV shows, and other titles for potentially biased content — racism, sexism, and LGBTQ+-phobia — and lets the community rate how severe each flag is.',
  },
  {
    value: 'imdb/standard',
    label: 'Movie-Meter',
    enabled: false,
    description: 'General movie and TV ratings and discussion — coming soon.',
  },
];

export const DEFAULT_DOMAIN = DOMAIN_OPTIONS[0].value;

/** DI seam so tests can substitute a different option set. */
export const DOMAIN_OPTIONS_TOKEN = new InjectionToken<readonly DomainOption[]>('DOMAIN_OPTIONS', {
  providedIn: 'root',
  factory: () => DOMAIN_OPTIONS,
});
