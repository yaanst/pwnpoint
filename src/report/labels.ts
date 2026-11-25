import {
  CRITERION_INFO,
  type Criterion,
  QUADRANT_NAMES,
  type Quadrant,
} from '../recommendations/model';
import type { SlideLanguage } from '../slides/theme';
import type { SecurityLevel } from './mission';

/** Report deck sections, in order. */
export const SECTIONS = [
  'introduction',
  'summary',
  'scenarios',
  'vulnerabilities',
  'recommendations',
  'appendix',
] as const;
export type Section = (typeof SECTIONS)[number];

export interface ReportLabels {
  title: string;
  agenda: string;
  page: string;
  sections: Record<Section, string>;
  modalities: {
    title: string;
    date: string;
    from: string;
    to: string;
    leadAuditor: string;
    auditors: string;
    client: string;
    auditType: string;
    scope: string;
    version: string;
    infraType: string;
    comments: string;
  };
  summary: {
    title: string;
    status: string;
    strengths: string;
    weaknesses: string;
    footnote: string;
    none: string;
  };
  levels: Record<SecurityLevel, { name: string; rule: string }>;
  appendix: {
    statusScale: string;
    status: string;
    description: string;
    severityScale: string;
    baseScore: string;
    severity: string;
    severityNames: { info: string; low: string; medium: string; high: string; critical: string };
    metrics: string;
    value: string;
    letter: string;
    score: string;
    scenarioScale: string;
    scenarioScaleTable: string;
    exploitability: string;
    impact: string;
    exploitabilityRule: string;
    impactRule: string;
    scenarioSeverity: string;
    scenarioSeverityTable: string;
    recoScales: string;
    criterion: string;
    lowest: string;
    highest: string;
    classification: string;
    recoClassification: string;
    rules: Record<Quadrant, string>;
  };
  criteria: Record<Criterion, { name: string; levels: Record<1 | 2 | 3, string> }>;
  quadrants: Record<Quadrant, string>;
  scenarios: {
    title: string;
    reference: string;
    scenario: string;
    severity: string;
    description: string;
    rationale: string;
    main: string;
    exploitabilityAxis: string;
    impactAxis: string;
  };
  vulns: {
    vector: string;
    baseScore: string;
    envScore: string;
    severity: string;
    reference: string;
    category: string;
    recommendation: string;
    description: string;
    continued: string;
  };
  plan: {
    title: string;
    ref: string;
    name: string;
    priority: string;
    footnote: (client: string) => string;
  };
}

export const REPORT_LABELS: Record<SlideLanguage, ReportLabels> = {
  en: {
    title: 'Assessment report',
    agenda: 'Agenda',
    page: 'Page',
    sections: {
      introduction: 'Introduction',
      summary: 'Executive summary',
      scenarios: 'Attack scenarios',
      vulnerabilities: 'Vulnerabilities',
      recommendations: 'Recommendations',
      appendix: 'Appendix',
    },
    modalities: {
      title: 'Assessment modalities',
      date: 'Assessment date',
      from: 'from',
      to: 'to',
      leadAuditor: 'Lead auditor',
      auditors: 'Auditors',
      client: 'Client',
      auditType: 'Assessment type',
      scope: 'Scope',
      version: 'Version',
      infraType: 'Infrastructure type',
      comments: 'Comments',
    },
    summary: {
      title: 'Security status',
      status: 'Security status*',
      strengths: 'Strengths',
      weaknesses: 'Areas of improvement',
      footnote: '*Based on the attack scenario severity scale described in the appendix.',
      none: 'None listed.',
    },
    levels: {
      Satisfactory: {
        name: 'Satisfactory',
        rule: 'No or only minor attack scenarios identified',
      },
      Pass: { name: 'Pass', rule: 'At least 1 moderate attack scenario identified' },
      'Improvements required': {
        name: 'Improvements required',
        rule: 'At least 1 major attack scenario identified',
      },
      Unsatisfactory: {
        name: 'Unsatisfactory',
        rule: 'At least 1 severe attack scenario identified',
      },
    },
    appendix: {
      statusScale: 'Global security status scale',
      status: 'Status',
      description: 'Description',
      severityScale: 'Vulnerability severity scale',
      baseScore: 'CVSS 3.1 score',
      severity: 'Severity',
      severityNames: {
        info: 'Info',
        low: 'Low',
        medium: 'Medium',
        high: 'High',
        critical: 'Critical',
      },
      metrics: 'CVSS 3.1 base metrics',
      value: 'Value',
      letter: 'Letter',
      score: 'Weight',
      scenarioScale: 'Attack scenario exploitability and impact scale',
      scenarioScaleTable: 'Scenario exploitability and impact scale',
      exploitability: 'Exploitability',
      impact: 'Impact',
      exploitabilityRule:
        'Attack scenarios chain vulnerabilities. A scenario’s exploitability is the minimum exploitability of the vulnerabilities along its easiest path.',
      impactRule:
        'Attack scenarios chain vulnerabilities. A scenario’s impact is the maximum impact of the vulnerabilities composing it.',
      scenarioSeverity: 'Attack scenario severity scale',
      scenarioSeverityTable: 'Scenario severity scale',
      recoScales: 'Recommendation scales',
      criterion: 'Criterion',
      lowest: 'Lowest – 1',
      highest: 'Highest – 3',
      classification: 'Classification',
      recoClassification: 'Recommendation classification',
      rules: {
        'quick-win': 'Complexity + Workload + Cost < 6 and Priority = 3',
        'side-action': 'Complexity + Workload + Cost < 6 and Priority ≤ 2',
        'heavy-project': 'Complexity + Workload + Cost ≥ 6 and Priority = 3',
        'can-be-delayed': 'Complexity + Workload + Cost ≥ 6 and Priority ≤ 2',
      },
    },
    criteria: CRITERION_INFO,
    quadrants: QUADRANT_NAMES,
    scenarios: {
      title: 'Identified attack scenarios',
      reference: 'Reference',
      scenario: 'Attack scenario',
      severity: 'Severity',
      description: 'Description',
      rationale: 'Rationale',
      main: 'Main scenario',
      exploitabilityAxis: '↑ Exploitability',
      impactAxis: 'Impact →',
    },
    vulns: {
      vector: 'CVSS 3.1 vector (AV-AC-PR-UI-C-I-A-S)',
      baseScore: 'Base score',
      envScore: 'Env. score',
      severity: 'Severity',
      reference: 'Reference',
      category: 'Category',
      recommendation: 'Recommendation',
      description: 'Description',
      continued: '(continued)',
    },
    plan: {
      title: 'Proposed action plan* to mitigate attack scenarios',
      ref: 'Ref.',
      name: 'Name',
      priority: 'Priority',
      footnote: (client) =>
        `*Remediation actions are classified by the auditors from their understanding of ${client}’s organisational and technical context. This classification is not definitive and should be challenged by ${client}’s stakeholders.`,
    },
  },
  fr: {
    title: 'Rapport d’audit',
    agenda: 'Sommaire',
    page: 'Page',
    sections: {
      introduction: 'Introduction',
      summary: 'Synthèse',
      scenarios: 'Scénarios d’attaque',
      vulnerabilities: 'Vulnérabilités',
      recommendations: 'Recommandations',
      appendix: 'Annexes',
    },
    modalities: {
      title: 'Modalités de l’audit',
      date: 'Dates de l’audit',
      from: 'du',
      to: 'au',
      leadAuditor: 'Auditeur principal',
      auditors: 'Auditeurs',
      client: 'Client',
      auditType: 'Type d’audit',
      scope: 'Périmètre',
      version: 'Version',
      infraType: 'Type d’infrastructure',
      comments: 'Commentaires',
    },
    summary: {
      title: 'Niveau de sécurité',
      status: 'Niveau de sécurité*',
      strengths: 'Points forts',
      weaknesses: 'Axes d’amélioration',
      footnote: '*Selon l’échelle de sévérité des scénarios d’attaque décrite en annexe.',
      none: 'Aucun.',
    },
    levels: {
      Satisfactory: {
        name: 'Satisfaisant',
        rule: 'Aucun scénario d’attaque, ou seulement des scénarios mineurs',
      },
      Pass: { name: 'Acceptable', rule: 'Au moins 1 scénario d’attaque modéré' },
      'Improvements required': {
        name: 'Améliorations requises',
        rule: 'Au moins 1 scénario d’attaque majeur',
      },
      Unsatisfactory: {
        name: 'Insuffisant',
        rule: 'Au moins 1 scénario d’attaque sévère',
      },
    },
    appendix: {
      statusScale: 'Échelle du niveau de sécurité',
      status: 'Niveau',
      description: 'Description',
      severityScale: 'Échelle de sévérité des vulnérabilités',
      baseScore: 'Score CVSS 3.1',
      severity: 'Sévérité',
      severityNames: {
        info: 'Info',
        low: 'Faible',
        medium: 'Moyenne',
        high: 'Élevée',
        critical: 'Critique',
      },
      metrics: 'Métriques de base CVSS 3.1',
      value: 'Valeur',
      letter: 'Lettre',
      score: 'Poids',
      scenarioScale: 'Échelle d’exploitabilité et d’impact des scénarios',
      scenarioScaleTable: 'Exploitabilité et impact des scénarios',
      exploitability: 'Exploitabilité',
      impact: 'Impact',
      exploitabilityRule:
        'Un scénario d’attaque enchaîne des vulnérabilités. Son exploitabilité est la plus faible exploitabilité des vulnérabilités de son chemin le plus facile.',
      impactRule:
        'Un scénario d’attaque enchaîne des vulnérabilités. Son impact est le plus fort impact des vulnérabilités qui le composent.',
      scenarioSeverity: 'Échelle de sévérité des scénarios d’attaque',
      scenarioSeverityTable: 'Sévérité des scénarios',
      recoScales: 'Échelles des recommandations',
      criterion: 'Critère',
      lowest: 'Plus faible – 1',
      highest: 'Plus fort – 3',
      classification: 'Classement',
      recoClassification: 'Classement des recommandations',
      rules: {
        'quick-win': 'Complexité + Charge + Coût < 6 et Priorité = 3',
        'side-action': 'Complexité + Charge + Coût < 6 et Priorité ≤ 2',
        'heavy-project': 'Complexité + Charge + Coût ≥ 6 et Priorité = 3',
        'can-be-delayed': 'Complexité + Charge + Coût ≥ 6 et Priorité ≤ 2',
      },
    },
    criteria: {
      complexity: {
        name: 'Complexité',
        levels: { 1: 'Action simple', 2: 'Quelques changements', 3: 'Projet lourd' },
      },
      workload: {
        name: 'Charge',
        levels: { 1: '0 à 10 jours-homme', 2: '10 à 20 jours-homme', 3: 'Plus de 20 jours-homme' },
      },
      cost: { name: 'Coût', levels: { 1: 'Faible', 2: 'Moyen', 3: 'Élevé' } },
      priority: {
        name: 'Priorité',
        levels: { 1: 'Peut être reportée', 2: 'Action secondaire', 3: 'Priorité haute' },
      },
    },
    quadrants: {
      'quick-win': 'Gain rapide',
      'heavy-project': 'Projet lourd',
      'side-action': 'Action secondaire',
      'can-be-delayed': 'Peut être reportée',
    },
    scenarios: {
      title: 'Scénarios d’attaque identifiés',
      reference: 'Référence',
      scenario: 'Scénario d’attaque',
      severity: 'Sévérité',
      description: 'Description',
      rationale: 'Justification',
      main: 'Scénario principal',
      exploitabilityAxis: '↑ Exploitabilité',
      impactAxis: 'Impact →',
    },
    vulns: {
      vector: 'Vecteur CVSS 3.1 (AV-AC-PR-UI-C-I-A-S)',
      baseScore: 'Score de base',
      envScore: 'Score env.',
      severity: 'Sévérité',
      reference: 'Référence',
      category: 'Catégorie',
      recommendation: 'Recommandation',
      description: 'Description',
      continued: '(suite)',
    },
    plan: {
      title: 'Plan d’action* proposé pour traiter les scénarios d’attaque',
      ref: 'Réf.',
      name: 'Intitulé',
      priority: 'Priorité',
      footnote: (client) =>
        `*Le classement des actions est proposé par les auditeurs selon leur compréhension du contexte organisationnel et technique de ${client}. Il n’est pas définitif et doit être discuté avec les équipes de ${client}.`,
    },
  },
};
