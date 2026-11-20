import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { Vault } from '../storage/vault';
import { DEFAULT_THEME } from './theme';
import { exportTheme, importTheme, loadTheme, saveTheme } from './themeStore';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
let n = 0;

describe('theme storage', () => {
  it('returns the default theme until one is saved, then the saved one with its logo', async () => {
    const vault = await Vault.open({ name: `theme-${++n}`, iterations: 1_000 });
    await vault.setup('passphrase');
    expect(await loadTheme(vault)).toEqual(DEFAULT_THEME);
    const custom = {
      ...DEFAULT_THEME,
      footerText: 'ACME – Confidential',
      logo: { bytes: png, width: 300, height: 80 },
    };
    await saveTheme(vault, custom);
    expect(await loadTheme(vault)).toEqual(custom);
    const { logo: _logo, ...withoutLogo } = custom;
    await saveTheme(vault, withoutLogo);
    expect(await loadTheme(vault)).toEqual(withoutLogo);
    vault.close();
  });
});

describe('theme import/export', () => {
  it('round-trips a theme with its logo', () => {
    const theme = {
      ...DEFAULT_THEME,
      language: 'fr' as const,
      logo: { bytes: png, width: 300, height: 80 },
    };
    expect(importTheme(exportTheme(theme))).toEqual({ ok: true, theme });
  });

  it('rejects files that are not themes', () => {
    expect(importTheme('nope')).toEqual({ ok: false, errors: ['This file is not valid JSON.'] });
    expect(importTheme('{"format":"other"}')).toMatchObject({
      ok: false,
      errors: [expect.stringMatching(/not a PwnPoint theme/)],
    });
  });

  it('reports every invalid field', () => {
    const data = JSON.parse(exportTheme(DEFAULT_THEME));
    data.theme.colors.accent = 'red; background:url(https://evil)';
    data.theme.severity.High.bg = '#12';
    data.theme.language = 'de';
    data.theme.minFontPt = 2;
    const r = importTheme(JSON.stringify(data));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toEqual([
        'High background must be a colour like #1a2b3c.',
        'Language must be "en" or "fr".',
        'The minimum font size must be a number between 6 and 24.',
        'Accent colour must be a colour like #1a2b3c.',
      ]);
    }
  });

  it('cleans font names so they cannot inject markup or CSS', () => {
    const data = JSON.parse(exportTheme(DEFAULT_THEME));
    data.theme.headingFont = 'Arial"; } <script>';
    const r = importTheme(JSON.stringify(data));
    expect(r.ok && r.theme.headingFont).toBe('Arial script');
  });

  it('only accepts a PNG logo', () => {
    const data = JSON.parse(exportTheme(DEFAULT_THEME));
    data.theme.logo = { pngBase64: btoa('<svg onload=alert(1)>'), width: 10, height: 10 };
    expect(importTheme(JSON.stringify(data))).toEqual({
      ok: false,
      errors: ['The logo must be a PNG image.'],
    });
  });
});
