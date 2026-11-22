import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { DEFAULT_DOMAIN, DOMAIN_OPTIONS_TOKEN, DomainOption } from './domain-options';
import { DomainConfig } from './domain/domain-config.model';
import { DOMAIN_REGISTRY } from './domain/domain-registry';

const STORAGE_KEY = 'imdb-ui-angular.selectedDomain';

/** The domain every request targets (see domain-header.interceptor.ts). */
@Injectable({ providedIn: 'root' })
export class DomainSelectionService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly options: readonly DomainOption[] = inject(DOMAIN_OPTIONS_TOKEN);

  private readonly selectedDomainSignal = signal<string>(this.readFromStorage());
  readonly selectedDomain = this.selectedDomainSignal.asReadonly();

  readonly activeDomainConfig = computed<DomainConfig>(() => {
    const domain = this.selectedDomain();
    const config = DOMAIN_REGISTRY.find((c) => c.value === domain);
    if (!config) {
      throw new Error(`No DomainConfig registered for domain "${domain}"`);
    }
    return config;
  });

  // Removed on the next switch so one domain's overrides don't leak into another.
  private previouslyAppliedTokenKeys: string[] = [];

  constructor() {
    effect(() => this.applyTheme(this.activeDomainConfig()));
  }

  private applyTheme(config: DomainConfig): void {
    const root = document.documentElement.style;
    for (const key of this.previouslyAppliedTokenKeys) {
      root.removeProperty(key);
    }
    for (const [key, value] of Object.entries(config.themeTokens)) {
      root.setProperty(key, value);
    }
    this.previouslyAppliedTokenKeys = Object.keys(config.themeTokens);
  }

  select(domain: string): void {
    const option = this.options.find((o) => o.value === domain);
    if (!option || !option.enabled || domain === this.selectedDomainSignal()) {
      return;
    }

    this.selectedDomainSignal.set(domain);
    this.writeToStorage(domain);

    // Accounts belong to one domain, so the session ends on a switch.
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
      // Storage unavailable: use the default.
    }
    return DEFAULT_DOMAIN;
  }

  private writeToStorage(domain: string): void {
    try {
      localStorage.setItem(STORAGE_KEY, domain);
    } catch {
      // Storage is optional; the signal holds the choice.
    }
  }
}
