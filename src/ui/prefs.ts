/**
 * UI preferences in localStorage (never user data). Storage can be blocked or throw (private
 * windows, strict settings): reads then fall back to the default and writes are dropped.
 */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not remembered: harmless for a preference.
  }
}

export type ColorScheme = 'system' | 'light' | 'dark';
export const COLOR_SCHEMES: readonly ColorScheme[] = ['system', 'light', 'dark'];
const SCHEME_KEY = 'pwnpoint.colorScheme';

export const parseColorScheme = (v: string | null): ColorScheme =>
  v === 'light' || v === 'dark' ? v : 'system';

export const loadColorScheme = () => parseColorScheme(readPref(SCHEME_KEY));

/** Sets `data-theme` on <html>: the CSS follows the system unless it is light or dark. */
export function applyColorScheme(scheme: ColorScheme, root = document.documentElement): void {
  if (scheme === 'system') delete root.dataset.theme;
  else root.dataset.theme = scheme;
}

export function saveColorScheme(scheme: ColorScheme): void {
  writePref(SCHEME_KEY, scheme === 'system' ? null : scheme);
  applyColorScheme(scheme);
}

const TIP_KEY = 'pwnpoint.onboardingDismissed';
export const onboardingDismissed = () => readPref(TIP_KEY) === '1';
export const dismissOnboarding = (dismissed = true) => writePref(TIP_KEY, dismissed ? '1' : null);
