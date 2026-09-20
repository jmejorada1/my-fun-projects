import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AutoOpenDialogDirective } from './auto-open-dialog.directive';

@Component({
  imports: [AutoOpenDialogDirective],
  template: `<dialog appAutoOpenDialog></dialog>`,
})
class HostComponent {}

describe('AutoOpenDialogDirective', () => {
  it('calls showModal() once the dialog renders', () => {
    const fixture = TestBed.createComponent(HostComponent);
    const dialog: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    // jsdom implements <dialog> but showModal() needs an explicit stub in
    // some environments — safe to always provide one before spying.
    dialog.showModal = dialog.showModal ?? (() => {});
    const showModalSpy = vi.spyOn(dialog, 'showModal');

    fixture.detectChanges();

    expect(showModalSpy).toHaveBeenCalled();
  });
});
