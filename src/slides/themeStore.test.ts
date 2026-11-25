import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { Vault } from '../storage/vault';
import { DEFAULT_REPORT_STYLE, DEFAULT_THEME, type SlideTheme } from './theme';
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

  it('keeps the report style and its images, and drops removed images', async () => {
    const vault = await Vault.open({ name: `theme-${++n}`, iterations: 1_000 });
    await vault.setup('passphrase');
    const withReport: SlideTheme = {
      ...DEFAULT_THEME,
      logo: { bytes: png, width: 300, height: 80 },
      report: {
        ...DEFAULT_REPORT_STYLE,
        primary: '#451dc7',
        cover: { bytes: new Uint8Array([...png, 9]), width: 1920, height: 1080 },
        coverLogo: { bytes: new Uint8Array([...png, 8]), width: 400, height: 100 },
      },
    };
    await saveTheme(vault, withReport);
    expect(await loadTheme(vault)).toEqual(withReport);
    const { cover: _c, ...noCover } = withReport.report ?? DEFAULT_REPORT_STYLE;
    await saveTheme(vault, { ...withReport, report: noCover });
    expect(await loadTheme(vault)).toEqual({ ...withReport, report: noCover });
    expect(await vault.getBytes('themes', 'active-cover')).toBeUndefined();
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

  it('round-trips the report style; a file without one has none', () => {
    const theme: SlideTheme = {
      ...DEFAULT_THEME,
      report: {
        ...DEFAULT_REPORT_STYLE,
        dark: '#250f6b',
        cover: { bytes: png, width: 1920, height: 1080 },
      },
    };
    expect(importTheme(exportTheme(theme))).toEqual({ ok: true, theme });
    const plain = importTheme(exportTheme(DEFAULT_THEME));
    expect(plain.ok && plain.theme.report).toBeUndefined();
  });

  it('checks the report style field by field', () => {
    const file = JSON.parse(exportTheme(DEFAULT_THEME)) as { theme: Record<string, unknown> };
    file.theme.report = { primary: 'red', cover: { pngBase64: 'AAAA', width: 10, height: 10 } };
    const result = importTheme(JSON.stringify(file));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('Report primary colour must be a colour like #1a2b3c.');
      expect(result.errors).toContain('The cover image must be a PNG image.');
    }
    // Missing colours fall back to the defaults.
    file.theme.report = {};
    const partial = importTheme(JSON.stringify(file));
    expect(partial.ok && partial.theme.report).toEqual(DEFAULT_REPORT_STYLE);
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
