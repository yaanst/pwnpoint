import type { Severity } from '../cvss/cvss31';
import type { Vault } from '../storage/vault';
import { base64ToBytes, bytesToBase64 } from '../util/base64';
import {
  DEFAULT_REPORT_STYLE,
  DEFAULT_THEME,
  HEX_COLOR,
  type ReportStyle,
  safeFontName,
  type SlideTheme,
  type ThemeImage,
} from './theme';

const THEME_ID = 'active';
/** Report images are stored as their own records, since a record holds one binary. */
const IMAGE_IDS = { cover: 'active-cover', coverLogo: 'active-cover-logo' } as const;
const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Low', 'None'];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_COVER_BYTES = 8 * 1024 * 1024;

type Size = { width: number; height: number };
type StoredStyle = Omit<ReportStyle, 'cover' | 'coverLogo'> & {
  coverSize?: Size;
  coverLogoSize?: Size;
};
type StoredTheme = Omit<SlideTheme, 'logo' | 'report'> & { logoSize?: Size; report?: StoredStyle };

/** The active slide theme (images stored sealed next to it), or the default. */
export async function loadTheme(vault: Vault): Promise<SlideTheme> {
  const stored = await vault.get<StoredTheme>('themes', THEME_ID);
  if (!stored) return DEFAULT_THEME;
  const { logoSize, report, ...rest } = stored;
  const theme: SlideTheme = rest;
  const bytes = logoSize ? await vault.getBytes('themes', THEME_ID) : undefined;
  if (bytes && logoSize) theme.logo = { bytes, ...logoSize };
  if (report) {
    const { coverSize, coverLogoSize, ...style } = report;
    const image = async (id: string, size?: Size): Promise<ThemeImage | undefined> => {
      const b = size ? await vault.getBytes('themes', id) : undefined;
      return b && size ? { bytes: b, ...size } : undefined;
    };
    const full: ReportStyle = { ...style };
    const cover = await image(IMAGE_IDS.cover, coverSize);
    const coverLogo = await image(IMAGE_IDS.coverLogo, coverLogoSize);
    if (cover) full.cover = cover;
    if (coverLogo) full.coverLogo = coverLogo;
    theme.report = full;
  }
  return theme;
}

const size = (i: ThemeImage): Size => ({ width: i.width, height: i.height });

export async function saveTheme(vault: Vault, theme: SlideTheme): Promise<void> {
  const { logo, report, ...rest } = theme;
  const value: StoredTheme = logo ? { ...rest, logoSize: size(logo) } : rest;
  if (report) {
    const { cover, coverLogo, ...style } = report;
    value.report = {
      ...style,
      ...(cover ? { coverSize: size(cover) } : {}),
      ...(coverLogo ? { coverLogoSize: size(coverLogo) } : {}),
    };
  }
  for (const key of ['cover', 'coverLogo'] as const) {
    const img = report?.[key];
    if (img) await vault.put('themes', { id: IMAGE_IDS[key] }, {}, img.bytes);
    else await vault.delete('themes', IMAGE_IDS[key]);
  }
  // Remove first so that dropping the logo also drops its stored bytes.
  if (!logo) await vault.delete('themes', THEME_ID);
  await vault.put('themes', { id: THEME_ID }, value, logo?.bytes);
}

export const THEME_FORMAT = 'pwnpoint-theme';

/** The theme file's content as a plain object (also embedded in mission files). */
const imageFile = (i: ThemeImage | undefined) =>
  i ? { pngBase64: bytesToBase64(i.bytes), width: i.width, height: i.height } : null;

export function themeFileObject(theme: SlideTheme) {
  const { logo, report, ...rest } = theme;
  const out: Record<string, unknown> = { ...rest, logo: imageFile(logo) };
  if (report) {
    const { cover, coverLogo, ...style } = report;
    out.report = { ...style, cover: imageFile(cover), coverLogo: imageFile(coverLogo) };
  }
  return { format: THEME_FORMAT, version: 1, theme: out };
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

  const image = (v: unknown, what: string, maxBytes: number): ThemeImage | undefined => {
    if (v === null || v === undefined) return undefined;
    if (
      !isObj(v) ||
      typeof v.pngBase64 !== 'string' ||
      typeof v.width !== 'number' ||
      typeof v.height !== 'number'
    ) {
      errors.push(`The ${what} is malformed.`);
      return undefined;
    }
    try {
      const bytes = base64ToBytes(v.pngBase64);
      const png = [137, 80, 78, 71, 13, 10, 26, 10];
      const mb = maxBytes / 1024 / 1024;
      if (bytes.length > maxBytes) errors.push(`The ${what} is larger than ${mb} MB.`);
      else if (png.some((b, k) => bytes[k] !== b)) errors.push(`The ${what} must be a PNG image.`);
      else if (v.width < 1 || v.height < 1 || v.width > 8192 || v.height > 8192)
        errors.push(`The ${what} size is invalid.`);
      else return { bytes, width: Math.round(v.width), height: Math.round(v.height) };
    } catch {
      errors.push(`The ${what} data is not valid base64.`);
    }
    return undefined;
  };

  const logo = image(t.logo, 'logo', MAX_LOGO_BYTES);
  if (logo) theme.logo = logo;
  if (t.report !== undefined && t.report !== null) {
    const r = isObj(t.report) ? t.report : (errors.push('The report style is malformed.'), {});
    const d = DEFAULT_REPORT_STYLE;
    const report: ReportStyle = {
      primary: r.primary === undefined ? d.primary : color(r.primary, 'Report primary colour'),
      dark: r.dark === undefined ? d.dark : color(r.dark, 'Report dark colour'),
      accent: r.accent === undefined ? d.accent : color(r.accent, 'Report accent colour'),
      light: r.light === undefined ? d.light : color(r.light, 'Report light colour'),
      onPrimary:
        r.onPrimary === undefined ? d.onPrimary : color(r.onPrimary, 'Report text on colour'),
    };
    const cover = image(r.cover, 'cover image', MAX_COVER_BYTES);
    const coverLogo = image(r.coverLogo, 'cover logo', MAX_LOGO_BYTES);
    if (cover) report.cover = cover;
    if (coverLogo) report.coverLogo = coverLogo;
    theme.report = report;
  }
  return errors.length ? { ok: false, errors } : { ok: true, theme };
}
