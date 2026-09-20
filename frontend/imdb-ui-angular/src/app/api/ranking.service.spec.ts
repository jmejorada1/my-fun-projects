import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { RankingService } from './ranking.service';
import { API_BASE_URL } from '../core/api-config';

describe('RankingService', () => {
  let service: RankingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RankingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches rankings with no query params', () => {
    service.getRankings().subscribe();

    httpMock.expectOne(`${API_BASE_URL}/rankings`).flush([]);
  });
});
