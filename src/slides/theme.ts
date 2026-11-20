import type { Severity } from '../cvss/cvss31';

export type SlideLanguage = 'en' | 'fr';

export interface SeverityColors {
  bg: string;
  fg: string;
}

export interface SlideTheme {
  version: 1;
  name: string;
  language: SlideLanguage;
  /** System font names only; nothing is downloaded. */
  headingFont: string;
  bodyFont: string;
  monoFont: string;
  colors: { background: string; text: string; muted: string; accent: string };
  severity: Record<Severity, SeverityColors>;
  footerText: string;
  /** Smallest font size allowed on a slide, in points. Text is never shrunk below it. */
  minFontPt: number;
  /** Logo as PNG bytes (metadata stripped), or none. */
  logo?: { bytes: Uint8Array<ArrayBuffer>; width: number; height: number };
}

export const DEFAULT_THEME: SlideTheme = {
  version: 1,
  name: 'Default',
  language: 'en',
  headingFont: 'Calibri',
  bodyFont: 'Calibri',
  monoFont: 'Consolas',
  colors: { background: '#ffffff', text: '#1a1d23', muted: '#555b66', accent: '#0b5cad' },
  severity: {
    Critical: { bg: '#a4161a', fg: '#ffffff' },
    High: { bg: '#c2410c', fg: '#ffffff' },
    Medium: { bg: '#f2c230', fg: '#1a1d23' },
    Low: { bg: '#2e7d32', fg: '#ffffff' },
    None: { bg: '#5b6270', fg: '#ffffff' },
  },
  footerText: 'Confidential',
  minFontPt: 10,
};

export interface SlideLabels {
  description: string;
  impact: string;
  recommendation: string;
  assets: string;
  severity: Record<Severity, string>;
  cvss: string;
  untitled: string;
  figure: string;
  logo: string;
  steps: string;
  references: string;
  evidence: string;
  severityLabel: string;
  overrideReason: string;
  coverSubtitle: string;
  findingCount: (n: number) => string;
}

export const LABELS: Record<SlideLanguage, SlideLabels> = {
  en: {
    description: 'Description',
    impact: 'Impact',
    recommendation: 'Recommendation',
    assets: 'Affected assets',
    severity: { Critical: 'Critical', High: 'High', Medium: 'Medium', Low: 'Low', None: 'None' },
    cvss: 'CVSS 3.1',
    untitled: 'Untitled finding',
    figure: 'Figure',
    logo: 'Logo',
    steps: 'Steps to reproduce',
    references: 'References',
    evidence: 'Evidence',
    severityLabel: 'Severity',
    overrideReason: 'Severity adjusted',
    coverSubtitle: 'Security assessment: findings',
    findingCount: (n) => `${n} finding${n === 1 ? '' : 's'}`,
  },
  fr: {
    description: 'Description',
    impact: 'Impact',
    recommendation: 'Recommandation',
    assets: 'Actifs concernés',
    severity: {
      Critical: 'Critique',
      High: 'Élevée',
      Medium: 'Moyenne',
      Low: 'Faible',
      None: 'Aucune',
    },
    cvss: 'CVSS 3.1',
    untitled: 'Vulnérabilité sans titre',
    figure: 'Figure',
    logo: 'Logo',
    steps: 'Étapes de reproduction',
    references: 'Références',
    evidence: 'Preuves',
    severityLabel: 'Sévérité',
    overrideReason: 'Sévérité ajustée',
    coverSubtitle: 'Audit de sécurité : vulnérabilités',
    findingCount: (n) => `${n} vulnérabilité${n > 1 ? 's' : ''}`,
  },
};

/** Font names are used in SVG attributes and canvas font strings: keep them plain. */
export function safeFontName(name: string, fallback: string): string {
  const clean = name
    .replace(/[^\p{L}\p{N} -]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return clean || fallback;
}

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;
