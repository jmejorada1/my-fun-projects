import { Injectable, effect, inject, signal } from '@angular/core';
import { Resource, ResourceService } from '../api/resource.service';
import { AuthService } from './auth.service';
import { AppHttpError } from './error.interceptor';

/** Shared by the toolbar, which searches, and the dashboard's search panel, which shows results. */
@Injectable({ providedIn: 'root' })
export class SearchStateService {
  private readonly resourceService = inject(ResourceService);
  private readonly auth = inject(AuthService);

  readonly results = signal<Resource[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly hasSearched = signal(false);

  constructor() {
    // Reset on every user change: results are domain-scoped and a domain switch logs the user out.
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

  clear(): void {
    this.results.set([]);
    this.errorMessage.set(null);
    this.hasSearched.set(false);
    this.loading.set(false);
  }
}
