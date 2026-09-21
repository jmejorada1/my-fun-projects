import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DomainSelectionService } from './domain-selection.service';
import { AuthService } from './auth.service';
import { DEFAULT_DOMAIN, DOMAIN_OPTIONS_TOKEN } from './domain-options';

const STORAGE_KEY = 'imdb-ui-angular.selectedDomain';
const USER_STORAGE_KEY = 'imdb-ui-angular.currentUser';
const STORED_USER = { id: 1, username: 'jdoe', email: 'jdoe@example.com', firstName: null, lastName: null };

// Two enabled options, unlike the real DOMAIN_OPTIONS (only one is enabled
// today) — needed to actually exercise "switch to a different domain"
// rather than just "re-select the only one available."
const TWO_ENABLED_OPTIONS = [
  { value: 'imdb/bigotry', label: 'Big-O-Meter', enabled: true, description: 'Bigotry flagging.' },
  { value: 'imdb/standard', label: 'Movie-Meter', enabled: true, description: 'Standard ratings.' },
];

describe('DomainSelectionService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('defaults to the default domain with nothing in storage', () => {
    const service = TestBed.inject(DomainSelectionService);
    expect(service.selectedDomain()).toBe(DEFAULT_DOMAIN);
  });

  it('restores a previously-selected (enabled) domain from storage', () => {
    localStorage.setItem(STORAGE_KEY, DEFAULT_DOMAIN);
    const service = TestBed.inject(DomainSelectionService);
    expect(service.selectedDomain()).toBe(DEFAULT_DOMAIN);
  });

  it('ignores a stored domain that is not enabled and falls back to the default', () => {
    localStorage.setItem(STORAGE_KEY, 'imdb/standard');
    const service = TestBed.inject(DomainSelectionService);
    expect(service.selectedDomain()).toBe(DEFAULT_DOMAIN);
  });

  it('select() ignores an unknown domain', () => {
    const service = TestBed.inject(DomainSelectionService);
    service.select('does-not-exist');
    expect(service.selectedDomain()).toBe(DEFAULT_DOMAIN);
  });

  it('select() ignores a listed-but-not-yet-enabled domain (movie-meter)', () => {
    const service = TestBed.inject(DomainSelectionService);
    service.select('imdb/standard');
    expect(service.selectedDomain()).toBe(DEFAULT_DOMAIN);
  });

  it('select() of the already-current domain is a no-op — no logout, no navigation', () => {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(STORED_USER));
    const service = TestBed.inject(DomainSelectionService);
    const auth = TestBed.inject(AuthService);
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

    service.select(DEFAULT_DOMAIN);

    expect(auth.currentUser()).not.toBeNull();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  describe('with a second enabled domain available', () => {
    beforeEach(() => {
      TestBed.overrideProvider(DOMAIN_OPTIONS_TOKEN, { useValue: TWO_ENABLED_OPTIONS });
    });

    it('switches the selected domain and persists it', () => {
      const service = TestBed.inject(DomainSelectionService);

      service.select('imdb/standard');

      expect(service.selectedDomain()).toBe('imdb/standard');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('imdb/standard');
    });

    it('logs out the current user and navigates to /login', () => {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(STORED_USER));
      const service = TestBed.inject(DomainSelectionService);
      const auth = TestBed.inject(AuthService);
      const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
      expect(auth.currentUser()).not.toBeNull();

      service.select('imdb/standard');

      expect(auth.currentUser()).toBeNull();
      expect(localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
      expect(navigateSpy).toHaveBeenCalledWith('/login');
    });

    it('does not navigate when switching domains with nobody logged in', () => {
      const service = TestBed.inject(DomainSelectionService);
      const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

      service.select('imdb/standard');

      expect(navigateSpy).not.toHaveBeenCalled();
    });
  });
});
