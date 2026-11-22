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

/** Placeholder auth with no password or token (design-spec.md decision #2). */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfigService);

  private readonly currentUserSignal = signal<AuthUser | null>(readFromStorage());
  readonly currentUser = this.currentUserSignal.asReadonly();

  /** 404 if the user doesn't exist. */
  login(username: string): Observable<AuthUser> {
    return this.http
      .get<AuthUser>(`${this.apiConfig.baseUrl()}/dev/users/by-username/${encodeURIComponent(username)}`)
      .pipe(tap((user) => this.setCurrentUser(user)));
  }

  /** 409 on a duplicate username or email. */
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
    // Storage unavailable: start logged out.
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
    // Storage is optional; the signal holds the user.
  }
}
