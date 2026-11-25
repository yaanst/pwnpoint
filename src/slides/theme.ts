import type { Severity } from '../cvss/cvss31';
import type { Rating, ScenarioSeverity } from '../scenarios/rating';

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
  /** Score label when the environmental score is used. */
  cvssEnvironmental: string;
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
  scenario: {
    untitled: string;
    start: string;
    goal: string;
    context: string;
    breakChain: string;
    path: string;
    exploitability: string;
    impact: string;
    severity: string;
    /** Shown instead of a rating the auditor has not set yet. */
    notRated: string;
    levels: {
      exploitability: Record<Rating, string>;
      impact: Record<Rating, string>;
      severity: Record<ScenarioSeverity, string>;
    };
    technique: string;
    chainBreaker: string;
    missing: string;
    noSteps: string;
    continuedOn: string;
    continuedFrom: string;
    gains: string;
    /** Branching scenarios, Markdown: "leads to: 3, 4". */
    leadsTo: string;
  };
}

export const LABELS: Record<SlideLanguage, SlideLabels> = {
  en: {
    description: 'Description',
    impact: 'Impact',
    recommendation: 'Recommendation',
    assets: 'Affected assets',
    severity: { Critical: 'Critical', High: 'High', Medium: 'Medium', Low: 'Low', None: 'None' },
    cvss: 'CVSS 3.1',
    cvssEnvironmental: 'CVSS 3.1 environmental',
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
    scenario: {
      untitled: 'Untitled scenario',
      start: 'Starting position',
      goal: 'Goal',
      context: 'Context',
      breakChain: 'Break the chain',
      path: 'Attack path',
      exploitability: 'Exploitability',
      impact: 'Impact',
      severity: 'Severity',
      notRated: 'Not rated',
      levels: {
        exploitability: { 1: 'Rare', 2: 'Unlikely', 3: 'Possible', 4: 'Likely', 5: 'Very likely' },
        impact: { 1: 'Negligible', 2: 'Low', 3: 'Medium', 4: 'Significant', 5: 'Very significant' },
        severity: { Minor: 'Minor', Moderate: 'Moderate', Major: 'Major', Severe: 'Severe' },
      },
      technique: 'Technique',
      chainBreaker: 'Chain breaker',
      missing: 'Missing finding',
      noSteps: 'No steps yet.',
      continuedOn: 'Continued on the next slide →',
      continuedFrom: '← Continued from the previous slide',
      gains: 'Gains',
      leadsTo: 'leads to',
    },
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
    cvssEnvironmental: 'CVSS 3.1 environnemental',
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
    scenario: {
      untitled: 'Scénario sans titre',
      start: 'Position de départ',
      goal: 'Objectif',
      context: 'Contexte',
      breakChain: 'Briser la chaîne',
      path: 'Chemin d’attaque',
      exploitability: 'Exploitabilité',
      impact: 'Impact',
      severity: 'Sévérité',
      notRated: 'Non évalué',
      levels: {
        exploitability: {
          1: 'Rare',
          2: 'Peu probable',
          3: 'Possible',
          4: 'Probable',
          5: 'Très probable',
        },
        impact: {
          1: 'Négligeable',
          2: 'Faible',
          3: 'Moyen',
          4: 'Significatif',
          5: 'Très significatif',
        },
        severity: { Minor: 'Mineure', Moderate: 'Modérée', Major: 'Majeure', Severe: 'Sévère' },
      },
      technique: 'Technique',
      chainBreaker: 'Point de rupture',
      missing: 'Vulnérabilité supprimée',
      noSteps: 'Aucune étape pour l’instant.',
      continuedOn: 'Suite sur la diapositive suivante →',
      continuedFrom: '← Suite de la diapositive précédente',
      gains: 'Gain',
      leadsTo: 'mène à',
    },
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
