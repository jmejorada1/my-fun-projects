import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { domainHeaderInterceptor } from './domain-header.interceptor';
import { DEFAULT_DOMAIN } from './domain-options';

describe('domainHeaderInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([domainHeaderInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('adds X-Domain to every outgoing request, sourced from DomainSelectionService', () => {
    http.get('/resources').subscribe();

    const req = httpMock.expectOne('/resources');
    expect(req.request.headers.get('X-Domain')).toBe(DEFAULT_DOMAIN);
    req.flush({});
  });
});
