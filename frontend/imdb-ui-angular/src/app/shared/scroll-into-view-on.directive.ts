import { Directive, ElementRef, effect, inject, input } from '@angular/core';

/** Scrolls the host into view when the bound condition becomes true. */
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
