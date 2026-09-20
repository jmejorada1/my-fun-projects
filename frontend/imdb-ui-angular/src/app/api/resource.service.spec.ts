import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ResourceService } from './resource.service';
import { API_BASE_URL } from '../core/api-config';

describe('ResourceService', () => {
  let service: ResourceService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ResourceService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('sends the search term as a query param', () => {
    service.search('shawshank').subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === `${API_BASE_URL}/resources` && r.params.get('search') === 'shawshank',
    );
    req.flush({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 });
  });

  it('omits the search param entirely for a blank term', () => {
    service.search('').subscribe();

    const req = httpMock.expectOne(`${API_BASE_URL}/resources`);
    expect(req.request.params.has('search')).toBe(false);
    req.flush({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 });
  });
});
