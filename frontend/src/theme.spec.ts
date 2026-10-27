import { applyThemePreference, readThemePreference, saveThemePreference } from './theme';

describe('theme preference', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('color-scheme');
  });

  it('defaults to system and rejects corrupted stored values', () => {
    expect(readThemePreference()).toBe('system');
    localStorage.setItem('whisper.theme', 'sepia');
    expect(readThemePreference()).toBe('system');
  });

  it.each(['light', 'dark', 'system'] as const)('persists %s for the next launch', preference => {
    saveThemePreference(preference);
    expect(readThemePreference()).toBe(preference);
  });

  it('removes explicit tokens and native-control overrides when returning to system', () => {
    applyThemePreference('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    applyThemePreference('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light dark');
  });

  it('still changes this session when preference storage is unavailable', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage denied'); });
    expect(readThemePreference()).toBe('system');
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage full'); });
    expect(() => saveThemePreference('light')).not.toThrow();
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});
