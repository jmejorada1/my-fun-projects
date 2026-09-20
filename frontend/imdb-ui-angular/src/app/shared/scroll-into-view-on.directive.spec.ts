import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ScrollIntoViewOnDirective } from './scroll-into-view-on.directive';

@Component({
  imports: [ScrollIntoViewOnDirective],
  template: `<div [appScrollIntoViewOn]="condition()"></div>`,
})
class HostComponent {
  readonly condition = signal(false);
}

describe('ScrollIntoViewOnDirective', () => {
  it('does not scroll while the condition is false', () => {
    const fixture = TestBed.createComponent(HostComponent);
    const div: HTMLElement = fixture.nativeElement.querySelector('div');
    // jsdom doesn't implement scrollIntoView at all — stub it before spying.
    const scrollSpy = (div.scrollIntoView = vi.fn());

    fixture.detectChanges();

    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it('scrolls into view once the condition becomes true', () => {
    const fixture = TestBed.createComponent(HostComponent);
    const div: HTMLElement = fixture.nativeElement.querySelector('div');
    const scrollSpy = (div.scrollIntoView = vi.fn());
    fixture.detectChanges();

    fixture.componentInstance.condition.set(true);
    fixture.detectChanges();
    TestBed.tick();

    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });
});
