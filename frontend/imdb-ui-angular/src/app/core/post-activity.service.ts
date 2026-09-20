import { Injectable, signal } from '@angular/core';

/**
 * Broadcasts "a post or reply was just created." The dashboard's left/right
 * panels (my-posts-panel, rankings-panel) load their data once on
 * construction and stay mounted across navigation (dashboard.component.ts),
 * so they have no other way to learn that something changed on a routed
 * child page like resource-detail — this is that missing signal.
 */
@Injectable({ providedIn: 'root' })
export class PostActivityService {
  private readonly version = signal(0);
  readonly changed = this.version.asReadonly();

  notifyPostOrReplyCreated(): void {
    this.version.update((v) => v + 1);
  }
}
