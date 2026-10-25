import { AfterViewInit, Directive, ElementRef, HostBinding, NgZone, OnDestroy } from '@angular/core';

/** Match Candor table construction: only overflowing tables add a keyboard stop. */
@Directive({ selector: '[appTableScroll]', standalone: true })
export class TableScrollDirective implements AfterViewInit, OnDestroy {
  @HostBinding('attr.tabindex') tabIndex: string | null = null;
  @HostBinding('attr.role') role: string | null = null;
  private observer?: ResizeObserver;

  constructor(private element: ElementRef<HTMLElement>, private zone: NgZone) {}

  ngAfterViewInit(): void {
    const host = this.element.nativeElement;
    const update = () => {
      const next = host.scrollWidth > host.clientWidth + 1 ? '0' : null;
      if (next === this.tabIndex) return;
      this.zone.run(() => { this.tabIndex = next; this.role = next ? 'region' : null; });
    };
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(update);
      this.observer.observe(host);
      const table = host.querySelector('table');
      if (table) this.observer.observe(table);
    }
    queueMicrotask(update);
  }

  ngOnDestroy(): void { this.observer?.disconnect(); }
}
