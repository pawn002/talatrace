import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Toast {
  id: string;
  message: string;
  variant: 'info' | 'success' | 'warning' | 'error';
}

@Injectable({ providedIn: 'root' })
export class ToastService implements OnDestroy {
  private toastsSubject = new BehaviorSubject<Toast[]>([]);
  toasts$ = this.toastsSubject.asObservable();
  timeoutSeconds = this.readTimeout();
  private timers = new Map<string, { remaining: number; started: number; timer?: ReturnType<typeof setTimeout>; paused: Set<string> }>();
  private paused = new Set<string>();
  private onBlur = () => this.pauseAll('inactive');
  private onFocus = () => this.resumeAll('inactive');
  private onVisibility = () => document.hidden ? this.pauseAll('hidden') : this.resumeAll('hidden');

  constructor() {
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  ngOnDestroy(): void {
    for (const state of this.timers.values()) clearTimeout(state.timer);
    window.removeEventListener('blur', this.onBlur); window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private readTimeout(): number {
    try { const value = localStorage.getItem('talatrace.toastTimeout'); return value !== null && ['0', '5', '10', '30'].includes(value) ? Number(value) : 10; }
    catch { return 10; }
  }

  setTimeoutSeconds(value: number): void {
    if (![0, 5, 10, 30].includes(value)) return;
    this.timeoutSeconds = value;
    try { localStorage.setItem('talatrace.toastTimeout', String(value)); } catch { /* Session preference still applies. */ }
    for (const [id, state] of this.timers) {
      clearTimeout(state.timer); state.timer = undefined; state.remaining = value * 1000;
      this.schedule(id);
    }
  }

  private schedule(id: string): void {
    const state = this.timers.get(id);
    if (!state || !this.timeoutSeconds || state.paused.size || this.paused.size || state.timer) return;
    state.started = Date.now(); state.timer = setTimeout(() => this.dismiss(id), state.remaining);
  }

  pause(id: string, reason: string): void {
    const state = this.timers.get(id); if (!state) return;
    if (state.timer) { clearTimeout(state.timer); state.timer = undefined; state.remaining = Math.max(0, state.remaining - (Date.now() - state.started)); }
    state.paused.add(reason);
  }

  resume(id: string, reason: string): void { this.timers.get(id)?.paused.delete(reason); this.schedule(id); }
  pauseAll(reason: string): void {
    this.paused.add(reason);
    for (const id of this.timers.keys()) { this.pause(id, 'global'); this.timers.get(id)?.paused.delete('global'); }
  }
  resumeAll(reason: string): void { this.paused.delete(reason); for (const id of this.timers.keys()) this.schedule(id); }

  show(
    message: string,
    variant: 'info' | 'success' | 'warning' | 'error' = 'info',
  ): void {
    // Keep one active copy of a persistent condition. Reuse the existing DOM
    // node so a focused dismiss control and its announcement are not replaced.
    if ((variant === 'warning' || variant === 'error') && this.toastsSubject.value.some(toast => toast.variant === variant && toast.message === message)) return;
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    this.toastsSubject.next([...this.toastsSubject.value, { id, message, variant }]);
    if (variant === 'info' || variant === 'success') {
      this.timers.set(id, { remaining: this.timeoutSeconds * 1000, started: 0, paused: new Set() });
      this.schedule(id);
    }
  }

  dismiss(id: string): void {
    clearTimeout(this.timers.get(id)?.timer); this.timers.delete(id);
    this.toastsSubject.next(this.toastsSubject.value.filter(t => t.id !== id));
  }
}
