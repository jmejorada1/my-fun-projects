import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AutofocusDirective } from './autofocus.directive';

@Component({
  imports: [AutofocusDirective],
  template: `<textarea appAutofocus></textarea>`,
})
class HostComponent {}

describe('AutofocusDirective', () => {
  it('focuses the host element once it renders', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const textarea = fixture.nativeElement.querySelector('textarea');
    expect(document.activeElement).toBe(textarea);
  });
});
