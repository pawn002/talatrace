import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    localStorage.removeItem('talatrace.toastTimeout');
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

  it('keeps notifications until explicitly dismissed with Never selected', fakeAsync(() => {
    service.setTimeoutSeconds(0);
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

  it('expires success/info after the saved timeout and retains warnings/errors', fakeAsync(() => {
    service.setTimeoutSeconds(5);
    service.show('Saved', 'success'); service.show('Info'); service.show('Warning', 'warning'); service.show('Error', 'error');
    let toasts: any[] = []; service.toasts$.subscribe(value => toasts = value);
    tick(4999); expect(toasts.length).toBe(4);
    tick(1); expect(toasts.map(toast => toast.message)).toEqual(['Warning', 'Error']);
    expect(localStorage.getItem('talatrace.toastTimeout')).toBe('5');
  }));

  it('preserves remaining time across overlapping hover, focus and inactive pauses', fakeAsync(() => {
    service.setTimeoutSeconds(5); service.show('Saved', 'success');
    let toasts: any[] = []; service.toasts$.subscribe(value => toasts = value);
    const id = toasts[0].id; tick(2000);
    service.pause(id, 'hover'); service.pause(id, 'focus'); tick(10000);
    service.resume(id, 'hover'); tick(10000); expect(toasts.length).toBe(1);
    service.pauseAll('inactive'); service.resume(id, 'focus'); tick(10000); expect(toasts.length).toBe(1);
    service.resumeAll('inactive'); tick(2999); expect(toasts.length).toBe(1);
    tick(1); expect(toasts.length).toBe(0);
  }));
});
