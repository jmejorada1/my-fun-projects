import { IMDB_STANDARD_CONFIG } from './imdb-standard.config';

describe('IMDB_STANDARD_CONFIG', () => {
  it('is a category-only rating domain with no neutral post type', () => {
    expect(IMDB_STANDARD_CONFIG.rating.mode).toBe('category-only');
    expect(IMDB_STANDARD_CONFIG.rating.fixedScoreValue).toBe(0);
    expect(IMDB_STANDARD_CONFIG.neutralPostTypeName).toBeNull();
    expect(IMDB_STANDARD_CONFIG.postProcessRankings).toBeUndefined();
  });

  it('badgeClassFor maps each rating category to a distinct badge class, worst to best', () => {
    expect(IMDB_STANDARD_CONFIG.badgeClassFor('skip-it', 0)).toBe('flag-badge--red');
    expect(IMDB_STANDARD_CONFIG.badgeClassFor('it-was-okay', 0)).toBe('flag-badge--orange');
    expect(IMDB_STANDARD_CONFIG.badgeClassFor('i-enjoyed-it', 0)).toBe('flag-badge--yellow');
    expect(IMDB_STANDARD_CONFIG.badgeClassFor('i-loved-it', 0)).toBe('flag-badge--green');
  });

  it('badgeClassFor falls back to a default bucket for an unrecognized category', () => {
    expect(IMDB_STANDARD_CONFIG.badgeClassFor('some-future-category', 0)).toBe('flag-badge--yellow');
  });

  it('is enabled — backend seed data exists (Phase 2b)', () => {
    expect(IMDB_STANDARD_CONFIG.enabled).toBe(true);
  });

  it('overrides the primary and severity-bucket theme tokens for its own skin', () => {
    expect(IMDB_STANDARD_CONFIG.themeTokens['--color-primary']).toBeTruthy();
    expect(Object.keys(IMDB_STANDARD_CONFIG.themeTokens)).toEqual(
      expect.arrayContaining([
        '--color-severity-red-bg',
        '--color-severity-orange-bg',
        '--color-severity-yellow-bg',
        '--color-severity-green-bg',
      ]),
    );
  });
});
