import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { DEFAULT_DOMAIN, DOMAIN_OPTIONS_TOKEN, DomainOption } from './domain-options';

const STORAGE_KEY = 'imdb-ui-angular.selectedDomain';

/**
 * Which domain every backend request targets (read by
 * domain-header.interceptor.ts). Persisted so a refresh keeps the choice.
 */
@Injectable({ providedIn: 'root' })
export class DomainSelectionService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly options: readonly DomainOption[] = inject(DOMAIN_OPTIONS_TOKEN);

  private readonly selectedDomainSignal = signal<string>(this.readFromStorage());
  readonly selectedDomain = this.selectedDomainSignal.asReadonly();

  select(domain: string): void {
    const option = this.options.find((o) => o.value === domain);
    if (!option || !option.enabled || domain === this.selectedDomainSignal()) {
      return;
    }

    this.selectedDomainSignal.set(domain);
    this.writeToStorage(domain);

    // Accounts are scoped to one domain (design-spec.md decision #9's
    // login/register split relies on this) — the current session, if any,
    // no longer applies once the domain changes underneath it.
    if (this.auth.currentUser()) {
      this.auth.logout();
      this.router.navigateByUrl('/login');
    }
  }

  private readFromStorage(): string {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && this.options.some((option) => option.value === stored && option.enabled)) {
        return stored;
      }
    } catch {
      // Private browsing / disabled storage — fall back to the default.
    }
    return DEFAULT_DOMAIN;
  }

  private writeToStorage(domain: string): void {
    try {
      localStorage.setItem(STORAGE_KEY, domain);
    } catch {
      // Signal is still the source of truth for this session either way.
    }
  }
}
