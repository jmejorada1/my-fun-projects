import { TestBed } from '@angular/core/testing';
import { PostActivityService } from './post-activity.service';

describe('PostActivityService', () => {
  it('starts at a stable baseline value', () => {
    const service = TestBed.inject(PostActivityService);
    expect(service.changed()).toBe(0);
  });

  it('notifyPostOrReplyCreated() changes the signal value each time', () => {
    const service = TestBed.inject(PostActivityService);
    const first = service.changed();

    service.notifyPostOrReplyCreated();
    const second = service.changed();
    expect(second).not.toBe(first);

    service.notifyPostOrReplyCreated();
    const third = service.changed();
    expect(third).not.toBe(second);
  });
});
