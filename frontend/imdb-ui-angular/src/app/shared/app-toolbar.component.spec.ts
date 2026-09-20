import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AppToolbarComponent } from './app-toolbar.component';
import { AuthService } from '../core/auth.service';
import { DomainSelectionService } from '../core/domain-selection.service';
import { DOMAIN_OPTIONS_TOKEN } from '../core/domain-options';
import { SearchStateService } from '../core/search-state.service';

const TWO_ENABLED_OPTIONS = [
  { value: 'imdb/bigotry', label: 'Big-O-Meter', enabled: true },
  { value: 'imdb/standard', label: 'Movie-Meter', enabled: true },
];
const STORED_USER = { id: 1, username: 'jdoe', email: 'jdoe@example.com', firstName: null, lastName: null };

describe('AppToolbarComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [AppToolbarComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('renders the friendly domain label, not the raw domain value', () => {
    const fixture = TestBed.createComponent(AppToolbarComponent);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Big-O-Meter');
    expect(text).not.toContain('imdb/bigotry');
  });

  it('renders a not-yet-enabled domain option as disabled with a "coming soon" note', () => {
    const fixture = TestBed.createComponent(AppToolbarComponent);
    fixture.detectChanges();

    const options: NodeListOf<HTMLOptionElement> = fixture.nativeElement.querySelectorAll('option');
    const movieMeter = Array.from(options).find((o) => o.value === 'imdb/standard');
    expect(movieMeter?.disabled).toBe(true);
    expect(movieMeter?.textContent).toContain('coming soon');
  });

  it('selecting a new domain calls DomainSelectionService.select with it', () => {
    TestBed.overrideProvider(DOMAIN_OPTIONS_TOKEN, { useValue: TWO_ENABLED_OPTIONS });
    const fixture = TestBed.createComponent(AppToolbarComponent);
    fixture.detectChanges();
    const selectSpy = vi.spyOn(TestBed.inject(DomainSelectionService), 'select');

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    select.value = 'imdb/standard';
    select.dispatchEvent(new Event('change'));

    expect(selectSpy).toHaveBeenCalledWith('imdb/standard');
  });

  it('shows no "Hi <username>"/Logout when nobody is logged in', () => {
    const fixture = TestBed.createComponent(AppToolbarComponent);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Hi ');
    expect(fixture.nativeElement.querySelector('.link-button')).toBeNull();
  });

  it('shows the domain picker but hides the search box when nobody is logged in', () => {
    const fixture = TestBed.createComponent(AppToolbarComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.domain-picker')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.search-form')).toBeNull();
  });

  it('shows the search box once a user is logged in', () => {
    localStorage.setItem('imdb-ui-angular.currentUser', JSON.stringify(STORED_USER));

    const fixture = TestBed.createComponent(AppToolbarComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.search-form')).toBeTruthy();
  });

  it('shows "Hi <username>" for the logged-in user', () => {
    localStorage.setItem('imdb-ui-angular.currentUser', JSON.stringify(STORED_USER));

    const fixture = TestBed.createComponent(AppToolbarComponent);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Hi jdoe');
  });

  it('logout clears the session and navigates to /login', () => {
    localStorage.setItem('imdb-ui-angular.currentUser', JSON.stringify(STORED_USER));
    const fixture = TestBed.createComponent(AppToolbarComponent);
    fixture.detectChanges();
    const auth = TestBed.inject(AuthService);
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

    fixture.componentInstance.logout();

    expect(auth.currentUser()).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith('/login');
  });

  describe('search', () => {
    let httpMock: HttpTestingController;

    beforeEach(() => {
      // The search box only renders once logged in.
      localStorage.setItem('imdb-ui-angular.currentUser', JSON.stringify(STORED_USER));
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('actually submits via the real DOM form', () => {
      // Same class of bug already fixed elsewhere: (ngSubmit) does nothing
      // without [formGroup] backing the <form>.
      const fixture = TestBed.createComponent(AppToolbarComponent);
      fixture.detectChanges();

      const input: HTMLInputElement = fixture.nativeElement.querySelector('.search-form input');
      input.value = 'shawshank';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      fixture.nativeElement
        .querySelector('.search-form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      httpMock.expectOne((r) => r.params.get('search') === 'shawshank').flush({
        content: [],
        totalElements: 0,
        totalPages: 0,
        number: 0,
        size: 20,
      });
    });

    it('submitSearch() delegates to SearchStateService with the typed term', () => {
      const fixture = TestBed.createComponent(AppToolbarComponent);
      fixture.detectChanges();
      const searchSpy = vi.spyOn(TestBed.inject(SearchStateService), 'search');
      fixture.componentInstance.searchForm.controls.term.setValue('carmencita');

      fixture.componentInstance.submitSearch();

      expect(searchSpy).toHaveBeenCalledWith('carmencita');
      httpMock.expectOne(() => true).flush({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 });
    });

    it('does not navigate when already on the dashboard route', () => {
      const fixture = TestBed.createComponent(AppToolbarComponent);
      fixture.detectChanges();
      const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
      fixture.componentInstance.searchForm.controls.term.setValue('carmencita');

      fixture.componentInstance.submitSearch();

      expect(navigateSpy).not.toHaveBeenCalled();
      httpMock.expectOne(() => true).flush({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 });
    });

    it('clears search state instead of hitting the backend when the term is blank', () => {
      const fixture = TestBed.createComponent(AppToolbarComponent);
      fixture.detectChanges();
      const searchState = TestBed.inject(SearchStateService);
      const searchSpy = vi.spyOn(searchState, 'search');
      const clearSpy = vi.spyOn(searchState, 'clear');
      fixture.componentInstance.searchForm.controls.term.setValue('');

      fixture.componentInstance.submitSearch();

      expect(searchSpy).not.toHaveBeenCalled();
      expect(clearSpy).toHaveBeenCalled();
      httpMock.expectNone(() => true);
    });

    it('clears search state for a whitespace-only term too', () => {
      const fixture = TestBed.createComponent(AppToolbarComponent);
      fixture.detectChanges();
      const searchState = TestBed.inject(SearchStateService);
      const searchSpy = vi.spyOn(searchState, 'search');
      fixture.componentInstance.searchForm.controls.term.setValue('   ');

      fixture.componentInstance.submitSearch();

      expect(searchSpy).not.toHaveBeenCalled();
      httpMock.expectNone(() => true);
    });
  });
});
