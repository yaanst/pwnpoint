import type { Severity } from '../cvss/cvss31';
import type { Vault } from '../storage/vault';
import { base64ToBytes, bytesToBase64 } from '../util/base64';
import { DEFAULT_THEME, HEX_COLOR, safeFontName, type SlideTheme } from './theme';

const THEME_ID = 'active';
const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Low', 'None'];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** The active slide theme (logo bytes stored sealed next to it), or the default. */
export async function loadTheme(vault: Vault): Promise<SlideTheme> {
  const stored = await vault.get<
    Omit<SlideTheme, 'logo'> & { logoSize?: { width: number; height: number } }
  >('themes', THEME_ID);
  if (!stored) return DEFAULT_THEME;
  const { logoSize, ...theme } = stored;
  const bytes = logoSize ? await vault.getBytes('themes', THEME_ID) : undefined;
  return bytes && logoSize ? { ...theme, logo: { bytes, ...logoSize } } : theme;
}

export async function saveTheme(vault: Vault, theme: SlideTheme): Promise<void> {
  const { logo, ...rest } = theme;
  const value = logo ? { ...rest, logoSize: { width: logo.width, height: logo.height } } : rest;
  // Remove first so that dropping the logo also drops its stored bytes.
  if (!logo) await vault.delete('themes', THEME_ID);
  await vault.put('themes', { id: THEME_ID }, value, logo?.bytes);
}

export const THEME_FORMAT = 'pwnpoint-theme';

/** The theme file's content as a plain object (also embedded in mission files). */
export function themeFileObject(theme: SlideTheme) {
  const { logo, ...rest } = theme;
  return {
    format: THEME_FORMAT,
    version: 1,
    theme: {
      ...rest,
      logo: logo
        ? { pngBase64: bytesToBase64(logo.bytes), width: logo.width, height: logo.height }
        : null,
    },
  };
}

export function exportTheme(theme: SlideTheme): string {
  return JSON.stringify(themeFileObject(theme), null, 2);
}

export type ImportResult = { ok: true; theme: SlideTheme } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validates an imported theme file field by field. Nothing from the file is used unless it has
 * the expected type and shape; unknown fields are ignored. The logo must be a real PNG.
 */
export function importTheme(json: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, errors: ['This file is not valid JSON.'] };
  }
  return validateThemeFile(data);
}

/** Validates a parsed theme file object (see `importTheme`). */
export function validateThemeFile(data: unknown): ImportResult {
  if (!isObj(data) || data.format !== THEME_FORMAT || data.version !== 1 || !isObj(data.theme)) {
    return { ok: false, errors: ['This is not a PwnPoint theme file (version 1).'] };
  }
  const t = data.theme;
  const errors: string[] = [];
  const str = (v: unknown, field: string, max = 200): string => {
    if (typeof v !== 'string' || v.length > max)
      errors.push(`${field} must be text (at most ${max} characters).`);
    return typeof v === 'string' ? v.slice(0, max) : '';
  };
  const color = (v: unknown, field: string): string => {
    if (typeof v !== 'string' || !HEX_COLOR.test(v))
      errors.push(`${field} must be a colour like #1a2b3c.`);
    return typeof v === 'string' ? v : '#000000';
  };

  const colors = isObj(t.colors) ? t.colors : {};
  const sev = isObj(t.severity) ? t.severity : {};
  const severity = Object.fromEntries(
    SEVERITIES.map((s) => {
      const c = isObj(sev[s]) ? sev[s] : {};
      return [s, { bg: color(c.bg, `${s} background`), fg: color(c.fg, `${s} text colour`) }];
    }),
  ) as SlideTheme['severity'];
  const language =
    t.language === 'fr'
      ? 'fr'
      : t.language === 'en'
        ? 'en'
        : (errors.push('Language must be "en" or "fr".'), 'en');
  const minFontPt = t.minFontPt;
  if (
    typeof minFontPt !== 'number' ||
    !Number.isFinite(minFontPt) ||
    minFontPt < 6 ||
    minFontPt > 24
  ) {
    errors.push('The minimum font size must be a number between 6 and 24.');
  }

  const theme: SlideTheme = {
    version: 1,
    name: str(t.name, 'Name', 80) || 'Imported theme',
    language,
    headingFont: safeFontName(str(t.headingFont, 'Heading font', 60), DEFAULT_THEME.headingFont),
    bodyFont: safeFontName(str(t.bodyFont, 'Body font', 60), DEFAULT_THEME.bodyFont),
    monoFont: safeFontName(str(t.monoFont, 'Monospace font', 60), DEFAULT_THEME.monoFont),
    colors: {
      background: color(colors.background, 'Background'),
      text: color(colors.text, 'Text colour'),
      muted: color(colors.muted, 'Muted text colour'),
      accent: color(colors.accent, 'Accent colour'),
    },
    severity,
    footerText: str(t.footerText, 'Footer text', 200),
    minFontPt: typeof minFontPt === 'number' ? minFontPt : DEFAULT_THEME.minFontPt,
  };

  if (t.logo !== null && t.logo !== undefined) {
    const l = t.logo;
    if (
      !isObj(l) ||
      typeof l.pngBase64 !== 'string' ||
      typeof l.width !== 'number' ||
      typeof l.height !== 'number'
    ) {
      errors.push('The logo is malformed.');
    } else {
      try {
        const bytes = base64ToBytes(l.pngBase64);
        const png = [137, 80, 78, 71, 13, 10, 26, 10];
        if (bytes.length > MAX_LOGO_BYTES) errors.push('The logo is larger than 2 MB.');
        else if (png.some((b, i) => bytes[i] !== b)) errors.push('The logo must be a PNG image.');
        else if (l.width < 1 || l.height < 1 || l.width > 4096 || l.height > 4096)
          errors.push('The logo size is invalid.');
        else theme.logo = { bytes, width: Math.round(l.width), height: Math.round(l.height) };
      } catch {
        errors.push('The logo data is not valid base64.');
      }
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, theme };
}
