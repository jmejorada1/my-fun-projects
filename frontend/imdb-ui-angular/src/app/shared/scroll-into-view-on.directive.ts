import { Directive, ElementRef, effect, inject, input } from '@angular/core';

/**
 * Scrolls the host element into view the moment its condition flips to
 * true — for drilling down from elsewhere in the app (e.g. the "My Posts"
 * panel) into one specific, possibly off-screen, row of a table.
 */
@Directive({
  selector: '[appScrollIntoViewOn]',
})
export class ScrollIntoViewOnDirective {
  readonly appScrollIntoViewOn = input.required<boolean>();
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  constructor() {
    effect(() => {
      const element = this.elementRef.nativeElement;
      if (this.appScrollIntoViewOn() && typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }
}
