import { TestBed } from '@angular/core/testing';
import { UrlTree, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('authGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  function runGuard() {
    return TestBed.runInInjectionContext(() => authGuard({} as never, { url: '/' } as never));
  }

  it('allows navigation when a user is logged in', () => {
    localStorage.setItem(
      'imdb-ui-angular.currentUser',
      JSON.stringify({ id: 1, username: 'jdoe', email: 'jdoe@example.com', firstName: null, lastName: null }),
    );
    TestBed.inject(AuthService); // ensure the signal picks up storage before the guard runs

    expect(runGuard()).toBe(true);
  });

  it('redirects to /login when no user is logged in', () => {
    const result = runGuard();

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/login');
  });
});
