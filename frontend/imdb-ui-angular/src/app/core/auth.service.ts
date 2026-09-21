import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { ApiConfigService } from './api-config';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

const STORAGE_KEY = 'imdb-ui-angular.currentUser';

/**
 * Placeholder auth (design-spec.md §2 decision #2) — no password/token. `login` looks
 * up an existing account by username; `register` creates a new one from a
 * username + email. Both just store whatever `AppUserResponse` the
 * backend returns; neither knows or cares how that response was obtained,
 * which is deliberate — a future Google identity provider replaces what's
 * inside these two methods without changing this service's public shape.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfigService);

  private readonly currentUserSignal = signal<AuthUser | null>(readFromStorage());
  readonly currentUser = this.currentUserSignal.asReadonly();

  /** Login: looks up an existing account. Errors (404) if none exists. */
  login(username: string): Observable<AuthUser> {
    return this.http
      .get<AuthUser>(`${this.apiConfig.baseUrl()}/dev/users/by-username/${encodeURIComponent(username)}`)
      .pipe(tap((user) => this.setCurrentUser(user)));
  }

  /** Register: always creates a new account. Errors (409) on a duplicate username/email. */
  register(username: string, email: string): Observable<AuthUser> {
    return this.http
      .post<AuthUser>(`${this.apiConfig.baseUrl()}/dev/users`, { username, email })
      .pipe(tap((user) => this.setCurrentUser(user)));
  }

  logout(): void {
    this.setCurrentUser(null);
  }

  private setCurrentUser(user: AuthUser | null): void {
    this.currentUserSignal.set(user);
    writeToStorage(user);
  }
}

function readFromStorage(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    // Private browsing / disabled storage — fall back to "logged out".
    return null;
  }
}

function writeToStorage(user: AuthUser | null): void {
  try {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Signal is still the source of truth for this session either way.
  }
}
