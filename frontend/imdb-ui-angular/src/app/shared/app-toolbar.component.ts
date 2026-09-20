import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { DomainSelectionService } from '../core/domain-selection.service';
import { SearchStateService } from '../core/search-state.service';

/**
 * Global — mounted on every route, including login/register, since which
 * domain (and thus which account, if any) applies matters everywhere, not
 * just on the dashboard (design-spec.md's login/register split, decision
 * #9). The domain picker is always shown; the search box and "Hi
 * <username>"/Logout only once logged in — search results land on the
 * dashboard's center panel (via SearchStateService), which sits behind
 * authGuard, so searching pre-login has nowhere to go.
 */
@Component({
  selector: 'app-toolbar',
  imports: [ReactiveFormsModule],
  templateUrl: './app-toolbar.component.html',
  styleUrl: './app-toolbar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppToolbarComponent {
  private readonly domainSelection = inject(DomainSelectionService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly searchState = inject(SearchStateService);

  readonly domainOptions = this.domainSelection.options;
  readonly selectedDomain = this.domainSelection.selectedDomain;
  readonly currentUser = this.auth.currentUser;

  // [formGroup] on the <form> is required for (ngSubmit) to fire at all —
  // see the identical bug fixed in login.component.ts.
  readonly searchForm = new FormGroup({ term: new FormControl('', { nonNullable: true }) });

  onDomainChange(event: Event): void {
    this.domainSelection.select((event.target as HTMLSelectElement).value);
  }

  submitSearch(): void {
    const term = this.searchForm.controls.term.value.trim();
    if (term) {
      this.searchState.search(term);
    } else {
      // A blank submit isn't "search for nothing" — it's "I'm done
      // searching," so clear back to the pre-search state instead of
      // hitting the backend with an empty query.
      this.searchState.clear();
    }
    // Results only render on the dashboard's center panel — get there if
    // we aren't already, without disturbing an in-progress search.
    if (this.router.url !== '/') {
      this.router.navigateByUrl('/');
    }
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
