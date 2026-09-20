import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { PostTypeService } from './post-type.service';
import { API_BASE_URL } from '../core/api-config';

describe('PostTypeService', () => {
  let service: PostTypeService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PostTypeService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches all post types', () => {
    service.listAll().subscribe();

    httpMock.expectOne(`${API_BASE_URL}/post-types`).flush([{ id: 1, name: 'racism' }]);
  });
});
