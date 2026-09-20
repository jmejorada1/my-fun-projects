import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { fromEvent, map, throttleTime } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { DomainSelectionService } from '../core/domain-selection.service';
import { SearchStateService } from '../core/search-state.service';

// A fraction of the viewport's own height, not a fixed pixel count — a flat
// px threshold would trigger at wildly different "how much have I actually
// scrolled" points depending on the screen (e.g. a tall 4K monitor vs. a
// small laptop), since it says nothing about how tall the viewport itself
// is. This way "Back to top" appears once you've scrolled about half a
// screen's worth, consistently across devices.
const BACK_TO_TOP_VIEWPORT_FRACTION = 0.5;

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

  // toSignal unsubscribes automatically on destroy — no manual cleanup needed.
  readonly showBackToTop = toSignal(
    fromEvent(window, 'scroll').pipe(
      throttleTime(100, undefined, { leading: true, trailing: true }),
      // window.innerHeight is read fresh on every scroll event (not cached
      // once), so this also stays correct across a resize or orientation
      // change, not just across different devices.
      map(() => window.scrollY > window.innerHeight * BACK_TO_TOP_VIEWPORT_FRACTION),
    ),
    { initialValue: false },
  );

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

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
