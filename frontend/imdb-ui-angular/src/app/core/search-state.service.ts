import { Injectable, effect, inject, signal } from '@angular/core';
import { Resource, ResourceService } from '../api/resource.service';
import { AuthService } from './auth.service';
import { AppHttpError } from './error.interceptor';

/**
 * Search lives in the global toolbar (AppToolbarComponent) but its results
 * are shown in the dashboard's center panel (SearchPanelComponent) — two
 * different components, so the results/loading/error state has to live
 * somewhere both can reach, not inside either component.
 */
@Injectable({ providedIn: 'root' })
export class SearchStateService {
  private readonly resourceService = inject(ResourceService);
  private readonly auth = inject(AuthService);

  readonly results = signal<Resource[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly hasSearched = signal(false);

  constructor() {
    // Resources are domain-scoped, but results/hasSearched here are a root
    // singleton that otherwise outlives any one login session. Without
    // this, switching domains (which logs the current user out first —
    // see DomainSelectionService.select()) leaves the *previous* domain's
    // search results on screen; clicking one navigates to a resourceId
    // that doesn't exist in the newly-selected domain ("Resource <id> not
    // found"). Reacting to every currentUser() transition — login,
    // logout, and register — resets this on login as well as logout, so a
    // fresh session never inherits another session's results either.
    effect(() => {
      this.auth.currentUser();
      this.clear();
    });
  }

  search(term: string): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.hasSearched.set(true);
    this.resourceService.search(term).subscribe({
      next: (page) => {
        this.results.set(page.content);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.errorMessage.set(err instanceof AppHttpError ? err.message : 'Search failed.');
        this.loading.set(false);
      },
    });
  }

  /** Back to the pre-search state — used when the search box is submitted empty. */
  clear(): void {
    this.results.set([]);
    this.errorMessage.set(null);
    this.hasSearched.set(false);
    this.loading.set(false);
  }
}
