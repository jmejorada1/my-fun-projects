import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { DEFAULT_DOMAIN, DOMAIN_OPTIONS_TOKEN, DomainOption } from './domain-options';
import { DomainConfig } from './domain/domain-config.model';
import { DOMAIN_REGISTRY } from './domain/domain-registry';

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

  /** The active domain's behavioral config (rating mode, badge coloring,
   *  etc.) — see core/domain/domain-config.model.ts. */
  readonly activeDomainConfig = computed<DomainConfig>(() => {
    const domain = this.selectedDomain();
    const config = DOMAIN_REGISTRY.find((c) => c.value === domain);
    if (!config) {
      throw new Error(`No DomainConfig registered for domain "${domain}"`);
    }
    return config;
  });

  // Keys most recently applied to :root by applyTheme() — cleared before
  // the next domain's tokens are applied so a switch between two
  // non-default domains doesn't leave a stale override behind (plan §8).
  private previouslyAppliedTokenKeys: string[] = [];

  constructor() {
    // Reruns on every domain switch (activeDomainConfig depends on
    // selectedDomain), including the very first evaluation for whichever
    // domain was restored from storage — so a page load already renders
    // in the right skin, not just a switch mid-session.
    effect(() => this.applyTheme(this.activeDomainConfig()));
  }

  private applyTheme(config: DomainConfig): void {
    const root = document.documentElement.style;
    for (const key of this.previouslyAppliedTokenKeys) {
      root.removeProperty(key); // fall back to styles.css's base :root value
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

    // Accounts are scoped to one domain (design-spec.md §2 decision #1's
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
