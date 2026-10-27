import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  it('show() adds a toast to the stream', () => {
    service.show('Hello', 'info');
    let toasts: any[] = [];
    service.toasts$.subscribe(t => (toasts = t));
    expect(toasts.length).toBe(1);
    expect(toasts[0].message).toBe('Hello');
    expect(toasts[0].variant).toBe('info');
  });

  it('show() defaults variant to info', () => {
    service.show('Default');
    let toasts: any[] = [];
    service.toasts$.subscribe(t => (toasts = t));
    expect(toasts[0].variant).toBe('info');
  });

  it('dismiss() removes the toast with the matching id', () => {
    service.show('A', 'success');
    service.show('B', 'error');
    let toasts: any[] = [];
    service.toasts$.subscribe(t => (toasts = t));
    expect(toasts.length).toBe(2);

    const id = toasts[0].id;
    service.dismiss(id);
    service.toasts$.subscribe(t => (toasts = t));
    expect(toasts.length).toBe(1);
    expect(toasts[0].message).toBe('B');
  });

  it('keeps notifications until explicitly dismissed', fakeAsync(() => {
    service.show('Persistent', 'info');
    let toasts: any[] = [];
    service.toasts$.subscribe(t => (toasts = t));
    expect(toasts.length).toBe(1);

    tick(60000);
    service.toasts$.subscribe(t => (toasts = t));
    expect(toasts.length).toBe(1);
    service.dismiss(toasts[0].id);
    service.toasts$.subscribe(t => (toasts = t));
    expect(toasts.length).toBe(0);
  }));
});
