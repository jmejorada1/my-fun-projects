import { Injectable, inject, signal } from '@angular/core';
import { Resource, ResourceService } from '../api/resource.service';
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

  readonly results = signal<Resource[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly hasSearched = signal(false);

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
}
