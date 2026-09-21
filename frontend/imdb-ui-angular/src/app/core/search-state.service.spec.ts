import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { SearchStateService } from './search-state.service';
import { AuthService } from './auth.service';
import { API_BASE_URL } from './api-config';
import { errorInterceptor } from './error.interceptor';

describe('SearchStateService', () => {
  let service: SearchStateService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    service = TestBed.inject(SearchStateService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('does not search until search() is called', () => {
    httpMock.expectNone(() => true);
    expect(service.hasSearched()).toBe(false);
  });

  it('search() populates results on success', () => {
    service.search('shawshank');

    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/resources` && r.params.get('search') === 'shawshank').flush({
      content: [{ id: 1, name: 'tt1', displayName: 'The Shawshank Redemption', category: { id: 1, name: 'movie', displayName: 'Movie' } }],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 20,
    });

    expect(service.loading()).toBe(false);
    expect(service.hasSearched()).toBe(true);
    expect(service.results().length).toBe(1);
  });

  it('search() records an error message on failure', () => {
    service.search('shawshank');

    httpMock
      .expectOne((r) => r.url === `${API_BASE_URL}/resources`)
      .flush({ detail: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(service.loading()).toBe(false);
    expect(service.errorMessage()).toBe('boom');
  });

  it('clear() resets back to the pre-search state without calling the backend', () => {
    service.search('shawshank');
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/resources`).flush({
      content: [{ id: 1, name: 'tt1', displayName: 'The Shawshank Redemption', category: { id: 1, name: 'movie', displayName: 'Movie' } }],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 20,
    });
    expect(service.results().length).toBe(1);

    service.clear();

    expect(service.results()).toEqual([]);
    expect(service.errorMessage()).toBeNull();
    expect(service.hasSearched()).toBe(false);
    expect(service.loading()).toBe(false);
    httpMock.expectNone(() => true);
  });

  it('clears stale results when the current user changes, e.g. a domain switch forcing a logout', () => {
    // Regression test: resources are domain-scoped, but this service is a
    // root singleton — without this, a domain switch (which logs the
    // current user out first — see DomainSelectionService.select()) left
    // the *previous* domain's results on screen. Clicking one navigated to
    // a resourceId that doesn't exist in the newly-selected domain
    // ("Resource <id> not found").
    service.search('shawshank');
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/resources`).flush({
      content: [{ id: 1, name: 'tt1', displayName: 'The Shawshank Redemption', category: { id: 1, name: 'movie', displayName: 'Movie' } }],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 20,
    });
    expect(service.results().length).toBe(1);

    TestBed.inject(AuthService).logout();
    TestBed.tick();

    expect(service.results()).toEqual([]);
    expect(service.hasSearched()).toBe(false);
  });
});
