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

  it('a new search shows loading and clears the previous error until it settles', () => {
    service.search('shawshank');
    httpMock
      .expectOne((r) => r.url === `${API_BASE_URL}/resources`)
      .flush({ detail: 'boom' }, { status: 500, statusText: 'Server Error' });

    service.search('shawshank');

    expect(service.loading()).toBe(true);
    expect(service.errorMessage()).toBeNull();
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/resources`).flush({
      content: [], totalElements: 0, totalPages: 0, number: 0, size: 20,
    });
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
    // Otherwise a domain switch leaves the old domain's results on screen.
    const auth = TestBed.inject(AuthService);
    auth.login('jdoe').subscribe();
    httpMock
      .expectOne(`${API_BASE_URL}/dev/users/by-username/jdoe`)
      .flush({ id: 1, username: 'jdoe', email: 'jdoe@example.com', firstName: null, lastName: null });
    // Flush the effect's first run, which clears regardless of any user change.
    TestBed.tick();
    service.search('shawshank');
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/resources`).flush({
      content: [{ id: 1, name: 'tt1', displayName: 'The Shawshank Redemption', category: { id: 1, name: 'movie', displayName: 'Movie' } }],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 20,
    });
    expect(service.results().length).toBe(1);

    auth.logout();
    TestBed.tick();

    expect(service.results()).toEqual([]);
    expect(service.hasSearched()).toBe(false);
  });
});
