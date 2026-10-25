export type ThemePreference = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'whisper.theme';

export function readThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch { return 'system'; }
}

export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
  root.style.colorScheme = preference === 'system' ? 'light dark' : preference;
}

export function saveThemePreference(preference: ThemePreference): void {
  applyThemePreference(preference);
  try { localStorage.setItem(STORAGE_KEY, preference); } catch { /* Session preference still works if storage is unavailable. */ }
}
