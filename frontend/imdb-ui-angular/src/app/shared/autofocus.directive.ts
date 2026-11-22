import { AfterViewInit, Directive, ElementRef, inject } from '@angular/core';

/** Focuses the host each time it's created, e.g. an inline reply box inside an @if. */
@Directive({
  selector: '[appAutofocus]',
})
export class AutofocusDirective implements AfterViewInit {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  ngAfterViewInit(): void {
    this.elementRef.nativeElement.focus();
  }
}
