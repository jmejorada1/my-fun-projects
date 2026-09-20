import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { API_BASE_URL } from './api-config';

const STORAGE_KEY = 'imdb-ui-angular.currentUser';

describe('AuthService', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('starts logged out with no stored user', () => {
    const auth = TestBed.inject(AuthService);
    expect(auth.currentUser()).toBeNull();
  });

  it('restores the current user from localStorage on construction', () => {
    const stored = { id: 1, username: 'jdoe', email: 'jdoe@example.com', firstName: null, lastName: null };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const auth = TestBed.inject(AuthService);

    expect(auth.currentUser()).toEqual(stored);
  });

  it('login() looks up an account by username and persists it to localStorage', () => {
    const auth = TestBed.inject(AuthService);
    const user = { id: 7, username: 'jdoe', email: 'jdoe@example.com', firstName: null, lastName: null };

    auth.login('jdoe').subscribe();

    const req = httpMock.expectOne(`${API_BASE_URL}/dev/users/by-username/jdoe`);
    expect(req.request.method).toBe('GET');
    req.flush(user);

    expect(auth.currentUser()).toEqual(user);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(user);
  });

  it('register() creates an account and persists it to localStorage (auto-login)', () => {
    const auth = TestBed.inject(AuthService);
    const user = { id: 8, username: 'new-user', email: 'new@example.com', firstName: null, lastName: null };

    auth.register('new-user', 'new@example.com').subscribe();

    const req = httpMock.expectOne(`${API_BASE_URL}/dev/users`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'new-user', email: 'new@example.com' });
    req.flush(user);

    expect(auth.currentUser()).toEqual(user);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(user);
  });

  it('logout() clears the current user and localStorage', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ id: 1, username: 'jdoe', email: 'jdoe@example.com', firstName: null, lastName: null }),
    );
    const auth = TestBed.inject(AuthService);

    auth.logout();

    expect(auth.currentUser()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
