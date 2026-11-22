import { Injectable, signal } from '@angular/core';

/** Tells the always-mounted dashboard panels that posts were created or deleted. */
@Injectable({ providedIn: 'root' })
export class PostActivityService {
  private readonly version = signal(0);
  readonly changed = this.version.asReadonly();

  notifyPostOrReplyCreated(): void {
    this.version.update((v) => v + 1);
  }
}
