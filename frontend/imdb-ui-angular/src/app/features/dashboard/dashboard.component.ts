import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MyPostsPanelComponent } from './my-posts-panel.component';
import { RankingsPanelComponent } from './rankings-panel.component';

const MIN_SIDE_PANEL_PX = 180;
const MAX_SIDE_PANEL_PX = 480;
const DEFAULT_SIDE_PANEL_PX = 280;
const STORAGE_KEY = 'imdb-ui-angular.dashboard-panel-widths';
const KEYBOARD_STEP_PX = 20;

interface StoredWidths {
  left: number;
  right: number;
}

function loadStoredWidths(): StoredWidths | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredWidths) : null;
  } catch {
    return null;
  }
}

function clamp(px: number): number {
  return Math.min(MAX_SIDE_PANEL_PX, Math.max(MIN_SIDE_PANEL_PX, px));
}

/**
 * The center panel is a child <router-outlet> (see app.routes.ts) rather
 * than a fixed component — it swaps between search results and a
 * resource's detail view depending on the URL, while this component (and
 * therefore the left/right panels) stays mounted the whole time.
 *
 * Left/right panel widths are user-resizable via drag handles and
 * persisted to localStorage as a per-viewer convenience — reasonable here
 * since it's just a layout preference, not state anyone else needs to see.
 */
@Component({
  selector: 'app-dashboard',
  imports: [MyPostsPanelComponent, RankingsPanelComponent, RouterOutlet],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly stored = loadStoredWidths();

  readonly leftWidth = signal(this.stored?.left ?? DEFAULT_SIDE_PANEL_PX);
  readonly rightWidth = signal(this.stored?.right ?? DEFAULT_SIDE_PANEL_PX);
  readonly resizing = signal(false);
  readonly gridTemplateColumns = computed(
    () => `${this.leftWidth()}px 6px minmax(320px, 1fr) 6px ${this.rightWidth()}px`,
  );

  private dragging: 'left' | 'right' | null = null;
  private dragStartX = 0;
  private dragStartWidth = 0;

  startResize(side: 'left' | 'right', event: PointerEvent): void {
    event.preventDefault();
    this.dragging = side;
    this.dragStartX = event.clientX;
    this.dragStartWidth = side === 'left' ? this.leftWidth() : this.rightWidth();
    this.resizing.set(true);
    const target = event.target as Element;
    if (typeof target.setPointerCapture === 'function') {
      target.setPointerCapture(event.pointerId);
    }
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragging) {
      return;
    }
    const delta = event.clientX - this.dragStartX;
    const raw = this.dragging === 'left' ? this.dragStartWidth + delta : this.dragStartWidth - delta;
    (this.dragging === 'left' ? this.leftWidth : this.rightWidth).set(clamp(raw));
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.dragging) {
      return;
    }
    this.dragging = null;
    this.resizing.set(false);
    this.persist();
    const target = event.target as Element;
    if (typeof target.releasePointerCapture === 'function') {
      target.releasePointerCapture(event.pointerId);
    }
  }

  /** Arrow-key resizing for the splitter, per the ARIA separator pattern. */
  onSplitterKeydown(side: 'left' | 'right', event: KeyboardEvent): void {
    let delta = 0;
    if (event.key === 'ArrowLeft') {
      delta = side === 'left' ? -KEYBOARD_STEP_PX : KEYBOARD_STEP_PX;
    } else if (event.key === 'ArrowRight') {
      delta = side === 'left' ? KEYBOARD_STEP_PX : -KEYBOARD_STEP_PX;
    } else {
      return;
    }
    event.preventDefault();
    const widthSignal = side === 'left' ? this.leftWidth : this.rightWidth;
    widthSignal.set(clamp(widthSignal() + delta));
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: this.leftWidth(), right: this.rightWidth() }));
    } catch {
      // Best-effort convenience only — fine if storage is unavailable.
    }
  }
}
