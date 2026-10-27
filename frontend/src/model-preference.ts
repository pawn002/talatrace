const STORAGE_KEY = 'talatrace.model';

export function readModelPreference(): string {
  try { return localStorage.getItem(STORAGE_KEY) || 'base'; }
  catch { return 'base'; }
}

export function saveModelPreference(model: string): void {
  try { localStorage.setItem(STORAGE_KEY, model); }
  catch { /* The current selection still works when storage is unavailable. */ }
}
