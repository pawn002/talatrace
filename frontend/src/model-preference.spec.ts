import { readModelPreference, saveModelPreference } from './model-preference';

describe('model preference', () => {
  afterEach(() => { jest.restoreAllMocks(); localStorage.clear(); });
  it('defaults to Base and retains the exact catalog ID', () => {
    localStorage.clear();
    expect(readModelPreference()).toBe('base');
    saveModelPreference('large-v3-turbo-q5_0');
    expect(readModelPreference()).toBe('large-v3-turbo-q5_0');
  });
  it('keeps working if persistent storage is blocked', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
    expect(readModelPreference()).toBe('base');
    expect(() => saveModelPreference('base')).not.toThrow();
  });
});
