import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { SearchPanelComponent } from './search-panel.component';
import { SearchStateService } from '../../core/search-state.service';
import { API_BASE_URL } from '../../core/api-config';

describe('SearchPanelComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchPanelComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('prompts to use the toolbar search box before anything has been searched', () => {
    const fixture = TestBed.createComponent(SearchPanelComponent);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('toolbar above');
  });

  it('renders results produced by SearchStateService (submitted from the toolbar)', () => {
    const fixture = TestBed.createComponent(SearchPanelComponent);
    fixture.detectChanges();

    TestBed.inject(SearchStateService).search('shawshank');
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/resources`).flush({
      content: [{
        id: 1, name: 'tt1', displayName: 'The Shawshank Redemption', category: { id: 1, name: 'movie', displayName: 'Movie' },
        postCount: 0, flagSummary: [],
      }],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 20,
    });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('The Shawshank Redemption');
  });

  it('shows total posts and flag-summary columns derived from the results', () => {
    const fixture = TestBed.createComponent(SearchPanelComponent);
    fixture.detectChanges();

    TestBed.inject(SearchStateService).search('carmen');
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/resources`).flush({
      content: [
        {
          id: 1, name: 'tt1', displayName: 'Carmencita', category: { id: 1, name: 'short', displayName: 'Short Film' },
          postCount: 3,
          flagSummary: [
            { postTypeName: 'racism', averageScore: 4.5, flagCount: 2 },
            { postTypeName: 'no-bigotry', averageScore: 0, flagCount: 1 },
          ],
        },
        {
          id: 2, name: 'tt2', displayName: 'A Clean Movie', category: { id: 1, name: 'movie', displayName: 'Movie' },
          postCount: 1,
          flagSummary: [{ postTypeName: 'sexism', averageScore: 2, flagCount: 1 }],
        },
      ],
      totalElements: 2,
      totalPages: 1,
      number: 0,
      size: 20,
    });
    fixture.detectChanges();

    // Columns are derived from whatever categories appear across all results.
    expect(fixture.componentInstance.flagCategories()).toEqual(['no-bigotry', 'racism', 'sexism']);

    const el = fixture.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);

    // Carmencita: total posts, avg+count for racism, bare count (no "flag(s)") for no-bigotry, "—" for sexism.
    expect(rows[0].textContent).toContain('3');
    expect(rows[0].textContent).toContain('avg 4.5 (2)');
    // Columns are alphabetical: no-bigotry, racism, sexism — the first badge is no-bigotry.
    expect(rows[0].querySelector('.flag-badge')?.textContent?.trim()).toBe('1');
    expect(rows[0].textContent).not.toContain('flag');
    expect(rows[0].textContent).not.toContain('avg 0.0');

    // A Clean Movie: no racism/no-bigotry entries, shown as "—".
    const cleanCells = Array.from(rows[1].querySelectorAll('td'));
    expect(cleanCells.some((c) => c.textContent?.trim() === '—')).toBe(true);
    expect(rows[1].textContent).toContain('avg 2.0 (1)');
  });

  it('shows "No results" for an empty result set after searching', () => {
    const fixture = TestBed.createComponent(SearchPanelComponent);
    fixture.detectChanges();

    TestBed.inject(SearchStateService).search('nothing-matches-this');
    httpMock
      .expectOne((r) => r.url === `${API_BASE_URL}/resources`)
      .flush({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No results.');
  });
});
