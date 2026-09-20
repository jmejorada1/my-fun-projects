import { AfterViewInit, Directive, ElementRef, inject } from '@angular/core';

/**
 * Calls the native <dialog>'s showModal() once it renders. Meant for a
 * dialog that only enters the DOM (via an @if) when it's actually needed —
 * ngAfterViewInit fires each time Angular (re)creates the host, same
 * pattern as AutofocusDirective.
 */
@Directive({
  selector: 'dialog[appAutoOpenDialog]',
})
export class AutoOpenDialogDirective implements AfterViewInit {
  private readonly elementRef = inject(ElementRef<HTMLDialogElement>);

  ngAfterViewInit(): void {
    this.elementRef.nativeElement.showModal();
  }
}
