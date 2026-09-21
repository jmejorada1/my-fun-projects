import { DomainConfig } from '../domain-config.model';

/**
 * "skip it" / "it was okay" / "I enjoyed it" / "I loved it" — a plain
 * rating, no severity to average (docs/domain-configurability-plan.md §4).
 * The backend's post_flag.score is still NOT NULL, so every flag this
 * domain creates still submits `rating.fixedScoreValue` — see plan §9.
 */
const CATEGORY_BADGE_CLASS: Readonly<Record<string, string>> = {
  // Reuses bigotry's four flag-badge classes as generic "tier 1..4" pill
  // buckets (worst -> best, matching bigotry's red=worst/green=best sense)
  // rather than inventing new CSS — themeTokens below reskins what each
  // bucket actually renders as, so no new CSS file is needed for this
  // domain (plan §5's "minimum files touched" goal).
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
  // Backend seed data exists (V17__seed_imdb_standard_domain.sql +
  // imdb-loader --domain imdb/standard) — plan §11, Phase 2b.
  enabled: true,
  rating: {
    mode: 'category-only',
    fixedScoreValue: 0,
  },
  badgeClassFor,
  // No neutral-flag concept for a plain rating — resource-detail's
  // conflicting-post dialog and rankings' postProcessRankings are both
  // no-ops for this domain (they key off neutralPostTypeName being null).
  neutralPostTypeName: null,
  themeTokens: {
    '--color-primary': '#0ea5e9',
    '--color-primary-hover': '#0284c7',
    '--color-primary-active': '#0369a1',
    '--color-primary-light': '#e0f2fe',

    // Reskins the reused flag-badge--red/orange/yellow/green buckets
    // (worst -> best) as grey -> blue -> teal -> gold instead of bigotry's
    // literal red -> orange -> yellow -> green.
    '--color-severity-red-bg': '#e2e8f0',
    '--color-severity-red-text': '#475569',
    '--color-severity-orange-bg': '#dbeafe',
    '--color-severity-orange-text': '#1d4ed8',
    '--color-severity-yellow-bg': '#ccfbf1',
    '--color-severity-yellow-text': '#0f766e',
    '--color-severity-green-bg': '#fef3c7',
    '--color-severity-green-text': '#b45309',
  },
};
