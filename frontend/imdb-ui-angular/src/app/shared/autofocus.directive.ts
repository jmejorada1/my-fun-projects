import { AfterViewInit, Directive, ElementRef, inject } from '@angular/core';

/**
 * Focuses the host element once it renders. Meant for a form that only
 * enters the DOM when the user asks for it (e.g. an inline reply box) —
 * `ngAfterViewInit` fires each time Angular (re)creates the host, so
 * re-opening after closing focuses it again too.
 */
@Directive({
  selector: '[appAutofocus]',
})
export class AutofocusDirective implements AfterViewInit {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  ngAfterViewInit(): void {
    this.elementRef.nativeElement.focus();
  }
}
