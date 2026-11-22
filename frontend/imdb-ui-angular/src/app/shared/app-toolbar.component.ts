import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { fromEvent, map, throttleTime } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { DomainSelectionService } from '../core/domain-selection.service';
import { SearchStateService } from '../core/search-state.service';

// A fraction of the viewport height, so it behaves the same on any screen size.
const BACK_TO_TOP_VIEWPORT_FRACTION = 0.5;

/** Shown on every route. Search and logout only appear once logged in, since results render on the guarded dashboard. */
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
  readonly activeDomainConfig = this.domainSelection.activeDomainConfig;

  readonly showBackToTop = toSignal(
    fromEvent(window, 'scroll').pipe(
      throttleTime(100, undefined, { leading: true, trailing: true }),
      map(() => window.scrollY > window.innerHeight * BACK_TO_TOP_VIEWPORT_FRACTION),
    ),
    { initialValue: false },
  );

  readonly searchForm = new FormGroup({ term: new FormControl('', { nonNullable: true }) });

  constructor() {
    // The toolbar never unmounts, so clear the search box whenever the user changes.
    effect(() => {
      this.auth.currentUser();
      this.searchForm.reset({ term: '' });
    });
  }

  onDomainChange(event: Event): void {
    this.domainSelection.select((event.target as HTMLSelectElement).value);
  }

  submitSearch(): void {
    const term = this.searchForm.controls.term.value.trim();
    if (term) {
      this.searchState.search(term);
    } else {
      // A blank submit clears the search.
      this.searchState.clear();
    }
    // Results only render on the dashboard.
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
