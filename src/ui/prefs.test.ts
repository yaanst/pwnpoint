import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyColorScheme,
  dismissOnboarding,
  loadColorScheme,
  onboardingDismissed,
  parseColorScheme,
  readPref,
  writePref,
} from './prefs';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

describe('UI preferences', () => {
  beforeEach(() => {
    globalThis.localStorage = memoryStorage();
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it('parses the colour scheme, defaulting to the system one', () => {
    expect(parseColorScheme('dark')).toBe('dark');
    expect(parseColorScheme('light')).toBe('light');
    expect(parseColorScheme(null)).toBe('system');
    expect(parseColorScheme('purple')).toBe('system');
    expect(loadColorScheme()).toBe('system');
  });

  it('sets data-theme only for an explicit choice', () => {
    const root = { dataset: {} as DOMStringMap } as HTMLElement;
    applyColorScheme('dark', root);
    expect(root.dataset.theme).toBe('dark');
    applyColorScheme('system', root);
    expect(root.dataset.theme).toBeUndefined();
  });

  it('remembers that the tip was dismissed, and can show it again', () => {
    expect(onboardingDismissed()).toBe(false);
    dismissOnboarding();
    expect(onboardingDismissed()).toBe(true);
    dismissOnboarding(false);
    expect(onboardingDismissed()).toBe(false);
  });

  it('survives blocked storage', () => {
    globalThis.localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(readPref('x')).toBeNull();
    expect(() => writePref('x', '1')).not.toThrow();
    expect(onboardingDismissed()).toBe(false);
  });
});
