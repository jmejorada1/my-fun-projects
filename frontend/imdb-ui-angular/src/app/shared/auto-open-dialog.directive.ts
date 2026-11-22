import { AfterViewInit, Directive, ElementRef, inject } from '@angular/core';

/** Calls showModal() each time the host <dialog> is created, e.g. inside an @if. */
@Directive({
  selector: 'dialog[appAutoOpenDialog]',
})
export class AutoOpenDialogDirective implements AfterViewInit {
  private readonly elementRef = inject(ElementRef<HTMLDialogElement>);

  ngAfterViewInit(): void {
    this.elementRef.nativeElement.showModal();
  }
}
