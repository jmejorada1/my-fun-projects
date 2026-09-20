import { TestBed } from '@angular/core/testing';
import { Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { DashboardComponent } from './dashboard.component';
import { SearchPanelComponent } from './search-panel.component';
import { ResourceDetailComponent } from '../resource-detail/resource-detail.component';
import { errorInterceptor } from '../../core/error.interceptor';
import { API_BASE_URL } from '../../core/api-config';

const EMPTY_PAGE = { content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 };

const RESOURCE = {
  id: 1,
  name: 'tt0000001',
  displayName: 'Carmencita',
  category: { id: 51, name: 'short', displayName: 'Short Film' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  postCount: 0,
  flagSummary: [],
};

// Mirrors the nesting in app.routes.ts (center panel as a child outlet)
// closely enough to exercise it, without pulling in the real lazy-loaded
// config or the login/register routes this suite doesn't need.
const routes: Routes = [
  {
    path: '',
    component: DashboardComponent,
    children: [
      { path: '', component: SearchPanelComponent },
      { path: 'resources/:id', component: ResourceDetailComponent },
    ],
  },
];

describe('DashboardComponent', () => {
  let httpMock: HttpTestingController;

  // rankings-panel wants an array; my-posts-panel (only fires when a user
  // is in localStorage) wants a Page<Post> — a blanket `[]` flush breaks
  // whichever one isn't an array.
  function flushPendingPanelRequests(): void {
    httpMock.match(() => true).forEach((req) => {
      req.flush(req.request.url.includes('/users/') ? EMPTY_PAGE : []);
    });
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('renders the my-posts and rankings panels plus search results by default', async () => {
    const harness = await RouterTestingHarness.create('/');
    flushPendingPanelRequests();
    harness.detectChanges();

    const el = harness.routeNativeElement!;
    expect(el.querySelector('app-my-posts-panel')).toBeTruthy();
    expect(el.querySelector('app-rankings-panel')).toBeTruthy();
    expect(el.querySelector('app-search-panel')).toBeTruthy();
  });

  it('keeps my-posts and rankings mounted while the center panel swaps to a resource\'s detail view', async () => {
    const harness = await RouterTestingHarness.create('/');
    flushPendingPanelRequests();
    harness.detectChanges();

    await harness.navigateByUrl('/resources/1');
    httpMock.expectOne(`${API_BASE_URL}/post-types`).flush([]);
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/resources/1`).flush(RESOURCE);
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/resources/1/posts`).flush(EMPTY_PAGE);
    harness.detectChanges();

    const el = harness.routeNativeElement!;
    expect(el.querySelector('app-my-posts-panel')).toBeTruthy();
    expect(el.querySelector('app-rankings-panel')).toBeTruthy();
    expect(el.querySelector('app-search-panel')).toBeNull();
    expect(el.querySelector('app-resource-detail')).toBeTruthy();
    expect(el.textContent).toContain('Carmencita');
  });

  it('lets the user drag-resize the left panel and persists the width', async () => {
    localStorage.removeItem('imdb-ui-angular.dashboard-panel-widths');
    const harness = await RouterTestingHarness.create('/');
    flushPendingPanelRequests();
    harness.detectChanges();

    const el = harness.routeNativeElement!;
    const dashboardEl = el.querySelector('.dashboard') as HTMLElement;
    const splitter = el.querySelector('.splitter') as HTMLElement;

    // MouseEvent, not PointerEvent — jsdom doesn't implement pointer
    // capture, and the component's (pointerdown) binding fires for any
    // native "pointerdown"-named event regardless of its concrete type.
    splitter.dispatchEvent(new MouseEvent('pointerdown', { clientX: 280, bubbles: true }));
    splitter.dispatchEvent(new MouseEvent('pointermove', { clientX: 340, bubbles: true }));
    splitter.dispatchEvent(new MouseEvent('pointerup', { clientX: 340, bubbles: true }));
    harness.detectChanges();

    expect(dashboardEl.style.gridTemplateColumns).toContain('340px');
    const stored = JSON.parse(localStorage.getItem('imdb-ui-angular.dashboard-panel-widths')!);
    expect(stored.left).toBe(340);
  });
});
