import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SearchStateService } from '../../core/search-state.service';
import { DomainSelectionService } from '../../core/domain-selection.service';
import { Resource, ResourceFlagSummaryEntry } from '../../api/resource.service';

/**
 * Center panel — renders whatever the last search produced. The search
 * box itself lives in the global toolbar (AppToolbarComponent), not here,
 * so results show up on the dashboard regardless of which page the search
 * was submitted from; SearchStateService is the shared state in between.
 *
 * Flag-summary columns are derived from whatever categories actually show
 * up in the current results (not a hardcoded list) — new post types just
 * appear as new columns automatically.
 */
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

  isNoBigotry(postTypeName: string): boolean {
    return postTypeName === this.domainSelection.activeDomainConfig().neutralPostTypeName;
  }

  flagSeverityClass(postTypeName: string, score: number): string {
    return this.domainSelection.activeDomainConfig().badgeClassFor(postTypeName, score);
  }
}
