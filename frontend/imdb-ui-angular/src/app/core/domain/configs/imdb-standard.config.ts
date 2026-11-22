import { DomainConfig } from '../domain-config.model';

// Reuses the shared badge classes worst to best; themeTokens below reskins them.
const CATEGORY_BADGE_CLASS: Readonly<Record<string, string>> = {
  'skip-it': 'flag-badge--red',
  'it-was-okay': 'flag-badge--orange',
  'i-enjoyed-it': 'flag-badge--yellow',
  'i-loved-it': 'flag-badge--green',
};

function badgeClassFor(postTypeName: string): string {
  return CATEGORY_BADGE_CLASS[postTypeName] ?? 'flag-badge--yellow';
}

export const IMDB_STANDARD_CONFIG: DomainConfig = {
  value: 'imdb/standard',
  label: 'Movie-Meter',
  description: 'General movie and TV ratings and discussion.',
  enabled: true,
  rating: {
    mode: 'category-only',
    fixedScoreValue: 0, // design-spec.md decision #7
  },
  badgeClassFor,
  neutralPostTypeName: null,
  themeTokens: {
    '--color-primary': '#0ea5e9',
    '--color-primary-hover': '#0284c7',
    '--color-primary-active': '#0369a1',
    '--color-primary-light': '#e0f2fe',

    // it-was-okay is neutral grey rather than orange.
    '--color-severity-orange-bg': '#e2e8f0',
    '--color-severity-orange-text': '#475569',
  },
};
