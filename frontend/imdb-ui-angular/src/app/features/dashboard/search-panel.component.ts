import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SearchStateService } from '../../core/search-state.service';
import { DomainSelectionService } from '../../core/domain-selection.service';
import { Resource, ResourceFlagSummaryEntry } from '../../api/resource.service';

/** Columns come from the categories present in the results, so new post types need no change. */
@Component({
  selector: 'app-search-panel',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './search-panel.component.html',
  styleUrl: './search-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPanelComponent {
  private readonly searchState = inject(SearchStateService);
  private readonly domainSelection = inject(DomainSelectionService);

  readonly results = this.searchState.results;
  readonly loading = this.searchState.loading;
  readonly errorMessage = this.searchState.errorMessage;
  readonly hasSearched = this.searchState.hasSearched;

  readonly flagCategories = computed(() => {
    const names = new Set<string>();
    for (const resource of this.results()) {
      for (const entry of resource.flagSummary) {
        names.add(entry.postTypeName);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  });

  flagEntryFor(resource: Resource, postTypeName: string): ResourceFlagSummaryEntry | undefined {
    return resource.flagSummary.find((entry) => entry.postTypeName === postTypeName);
  }

  /** Neutral flags and category-only domains show a bare count instead of an average. */
  isCountOnly(postTypeName: string): boolean {
    const config = this.domainSelection.activeDomainConfig();
    return config.rating.mode === 'category-only' || postTypeName === config.neutralPostTypeName;
  }

  flagSeverityClass(postTypeName: string, score: number): string {
    return this.domainSelection.activeDomainConfig().badgeClassFor(postTypeName, score);
  }
}
