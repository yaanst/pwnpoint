import type { Finding, Project } from '../findings/model';
import type { Recommendation } from '../recommendations/model';
import { CRITERIA, QUADRANTS, SCALE3 } from '../recommendations/model';
import type { Scenario } from '../scenarios/model';
import { RATINGS, scenarioSeverity, SEVERITY_COLOURS } from '../scenarios/rating';
import {
  fitImage,
  LINE_HEIGHT,
  type EvidenceRef,
  type Paragraph,
  ptToIn,
  type Slide,
  SLIDE_H,
  SLIDE_W,
  type SlideElement,
  textBox,
  toParagraphs,
} from '../slides/layout';
import { LABELS, type SlideTheme } from '../slides/theme';
import type { Measure } from '../slides/wrap';
import {
  type Cell,
  CONTENT_BOTTOM,
  CONTENT_TOP,
  CONTENT_W,
  type Ctx,
  footer,
  header,
  headRow,
  makeCtx,
  MARGIN,
  newSlide,
  para,
  table,
  titleRow,
} from './draw';
import { type Section, SECTIONS } from './labels';
import {
  actionPlan,
  reportFindings,
  scenarioDetail,
  scenarioSummary,
  vulnerabilitySlides,
} from './sections';
import {
  EMPTY_MISSION,
  formatDateRange,
  type MissionDetails,
  SECURITY_LEVELS,
  type SecurityLevel,
  securityStatus,
} from './mission';

/**
 * The full report deck (reportDeck flag): cover, an agenda before each section, the
 * sections' slides, appendices and a closing slide. Pure: theme + data + Measure → slides.
 */

export interface ReportInput {
  project: Project;
  scenarios: Scenario[];
  /** Every finding of the project (validated ones are reported; others resolve scenario steps). */
  findings?: Finding[];
  recommendations?: Recommendation[];
  /** Evidence of each finding, in order. */
  evidence?: Map<string, EvidenceRef[]>;
}

export interface ReportDeck {
  slides: Slide[];
  /** Where each section starts (1-based slide number), for sections that have slides. */
  sections: { section: Section; page: number }[];
}

/** The security level's colours: the severity colours of the matching scenario severity. */
const LEVEL_SEVERITY = {
  Satisfactory: 'Low',
  Pass: 'Medium',
  'Improvements required': 'High',
  Unsatisfactory: 'Critical',
} as const;

const running = (ctx: Ctx, m: MissionDetails) =>
  `${ctx.L.title} – ${[m.client, m.product]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ')}`;

function contentSlide(
  ctx: Ctx,
  m: MissionDetails,
  section: Section,
  title: string,
  elements: SlideElement[],
  warnings: string[] = [],
): Slide {
  const slide = newSlide([
    ...header(ctx, ctx.L.sections[section], title, running(ctx, m)),
    ...elements,
  ]);
  slide.warnings.push(...warnings);
  return slide;
}

function coverBackground(ctx: Ctx): { elements: SlideElement[]; background: string } {
  const cover = ctx.style.cover;
  if (!cover) return { elements: [], background: ctx.style.dark };
  // Fill the slide, cropping the image's overflow by centring it (PowerPoint keeps it whole).
  const scale = Math.max(SLIDE_W / cover.width, SLIDE_H / cover.height);
  const w = cover.width * scale;
  const h = cover.height * scale;
  return {
    background: ctx.style.dark,
    elements: [
      { kind: 'image', source: 'cover', alt: '', x: (SLIDE_W - w) / 2, y: (SLIDE_H - h) / 2, w, h },
    ],
  };
}

function coverSlide(ctx: Ctx, m: MissionDetails): Slide {
  const { elements, background } = coverBackground(ctx);
  const c = ctx.style.onPrimary;
  const who = [m.client, m.product]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' - ');
  const meta = [
    formatDateRange(m.from, m.to, ctx.theme.language),
    m.version.trim() ? `v${m.version.trim()}` : '',
    ctx.theme.footerText,
  ]
    .filter(Boolean)
    .join(' | ');
  const box = (text: string, role: string, y: number, size: number, bold = false) =>
    textBox(
      [para(text, bold)],
      {
        role,
        x: MARGIN,
        y,
        w: SLIDE_W * 0.55,
        h: ptToIn(ctx.pt(size)) * LINE_HEIGHT * 2,
        sizePt: ctx.pt(size),
        color: c,
        ...ctx.heading,
      },
      ctx.measure,
    );
  elements.push(
    box(ctx.L.title, 'cover-title', 1.6, 32),
    box(who, 'cover-subtitle', 2.4, 16),
    box(meta, 'cover-meta', 2.95, 10),
  );
  const logo = ctx.style.coverLogo;
  if (logo) {
    const fit = fitImage(logo.width, logo.height, { x: MARGIN, y: 6.3, w: 2.6, h: 0.6 });
    elements.push({ kind: 'image', source: 'coverLogo', alt: 'Logo', ...fit, x: MARGIN });
  }
  const slide = newSlide(elements, background);
  if (!who) slide.warnings.push('Add the client and product on the Report page.');
  return slide;
}

function closingSlide(ctx: Ctx): Slide {
  const { elements, background } = coverBackground(ctx);
  const logo = ctx.style.coverLogo;
  if (logo) {
    const fit = fitImage(logo.width, logo.height, {
      x: SLIDE_W / 2 - 2,
      y: SLIDE_H / 2 - 1.2,
      w: 4,
      h: 2.4,
    });
    elements.push({ kind: 'image', source: 'coverLogo', alt: 'Logo', ...fit });
  }
  return newSlide(elements, background);
}

function agendaSlide(ctx: Ctx, entries: ReportDeck['sections'], current: Section): Slide {
  const { style } = ctx;
  const size = ctx.pt(14);
  const elements: SlideElement[] = [
    textBox(
      [para(ctx.L.agenda.toUpperCase())],
      {
        role: 'title',
        x: MARGIN,
        y: 0.42,
        w: CONTENT_W,
        h: ptToIn(ctx.pt(24)) * LINE_HEIGHT,
        sizePt: ctx.pt(24),
        color: style.primary,
        ...ctx.heading,
      },
      ctx.measure,
    ),
  ];
  entries.forEach((e, i) => {
    const y = 1.3 + i * 0.55;
    const h = ptToIn(size) * LINE_HEIGHT;
    const on = e.section === current;
    elements.push(
      textBox(
        [para(`${i + 1}`, true)],
        {
          role: 'agenda-number',
          x: MARGIN + 0.1,
          y,
          w: 0.5,
          h,
          sizePt: size,
          color: style.accent,
          ...ctx.body,
        },
        ctx.measure,
      ),
      textBox(
        [para(ctx.L.sections[e.section], on)],
        {
          role: on ? 'agenda-current' : 'agenda-item',
          x: MARGIN + 1,
          y,
          w: 8,
          h,
          sizePt: size,
          color: style.primary,
          ...ctx.body,
        },
        ctx.measure,
      ),
      textBox(
        [para(`${ctx.L.page} ${e.page}`)],
        {
          role: 'agenda-page',
          x: SLIDE_W - MARGIN - 1.5,
          y: y + 0.03,
          w: 1.5,
          h,
          sizePt: ctx.pt(10),
          color: style.primary,
          align: 'right',
          ...ctx.body,
        },
        ctx.measure,
      ),
    );
  });
  return newSlide(elements);
}

function modalitiesSlide(ctx: Ctx, m: MissionDetails): Slide {
  const L = ctx.L.modalities;
  const s = ctx.style;
  const label = (text: string): Cell => ({ text, fill: s.primary, color: s.onPrimary, bold: true });
  const value = (text: string): Cell => ({ text: text.trim() || '—', colSpan: 4 });
  const rows: Cell[][] = [
    [
      label(L.date),
      { text: L.from, fill: s.primary, color: s.onPrimary },
      { text: formatDateRange(m.from, m.from, ctx.theme.language) || '—' },
      { text: L.to, fill: s.primary, color: s.onPrimary },
      { text: formatDateRange(m.to, m.to, ctx.theme.language) || '—' },
    ],
    [label(L.leadAuditor), value(m.leadAuditor)],
    [label(L.auditors), value(m.auditors.join(', '))],
    [label(L.client), value(m.client)],
    [label(L.auditType), value(m.auditType)],
    [label(L.scope), value(m.scope)],
    [label(L.version), value(m.version)],
    [label(L.infraType), value(m.infraType)],
    [label(L.comments), { text: commentParagraphs(m.comments), colSpan: 4 }],
  ];
  const t = table(ctx, MARGIN, CONTENT_TOP + 0.1, [2.6, 2.43, 2.43, 2.43, 2.44], rows, {
    minRowH: 0.38,
  });
  return contentSlide(
    ctx,
    m,
    'introduction',
    L.title,
    t.elements,
    t.overflow
      ? ['The assessment details are too long for one slide. Shorten the scope or comments.']
      : [],
  );
}

/** Markdown-lite comments → paragraphs; bullets are written with "• " (cells have no indent). */
function commentParagraphs(text: string): Paragraph[] {
  const ps = toParagraphs(text);
  if (!ps.length) return [para('—')];
  return ps.map((p) => (p.bullet ? { runs: [{ text: '•  ' }, ...p.runs] } : p));
}

function summarySlide(ctx: Ctx, m: MissionDetails, scenarios: Scenario[]): Slide {
  const { style } = ctx;
  const L = ctx.L.summary;
  const level = securityStatus(scenarios).level;
  const levelName = ctx.L.levels[level].name;
  const warnings: string[] = [];
  const body = ctx.pt(12);
  const elements: SlideElement[] = [];

  // The security status sentence, on a band across the slide.
  const product = m.product.trim() || '—';
  const reason = m.securityLevelReason.trim().replace(/\.$/, '');
  const sentence =
    ctx.theme.language === 'fr'
      ? [
          { text: `Le niveau de sécurité de ${product} est ` },
          { text: levelName, bold: true },
          { text: reason ? `, car ${reason}.` : '.' },
        ]
      : [
          { text: `${product.endsWith('s') ? `${product}’` : `${product}’s`} security level is ` },
          { text: levelName, bold: true },
          { text: reason ? `, as ${reason}.` : '.' },
        ];
  elements.push(
    { kind: 'rect', x: 0, y: 1.05, w: SLIDE_W, h: 0.55, fill: style.primary },
    textBox(
      [{ runs: sentence }],
      {
        role: 'status-sentence',
        x: MARGIN,
        y: 1.08,
        w: CONTENT_W,
        h: 0.5,
        sizePt: body,
        color: style.onPrimary,
        align: 'center',
        valign: 'middle',
        ...ctx.body,
      },
      ctx.measure,
    ),
  );

  // Strengths and areas of improvement.
  const listBox = (
    title: string,
    items: string[],
    mark: string,
    y: number,
    h: number,
    role: string,
  ) => {
    const w = 7.6;
    elements.push({
      kind: 'rect',
      x: MARGIN,
      y,
      w,
      h,
      fill: '#ffffff',
      stroke: style.primary,
      strokePt: 1,
      radius: 0.15,
    });
    elements.push(
      textBox(
        [para(title, true)],
        {
          role: `${role}-title`,
          x: MARGIN + 0.2,
          y: y + 0.12,
          w: w - 0.4,
          h: ptToIn(ctx.pt(13)) * LINE_HEIGHT,
          sizePt: ctx.pt(13),
          color: style.primary,
          ...ctx.body,
        },
        ctx.measure,
      ),
    );
    const list = textBox(
      items.length ? items.map((t) => ({ runs: [{ text: `${mark}  ${t}` }] })) : [para(L.none)],
      {
        role,
        x: MARGIN + 0.3,
        y: y + 0.5,
        w: w - 0.55,
        h: h - 0.6,
        sizePt: body,
        color: ctx.theme.colors.text,
        ...ctx.body,
      },
      ctx.measure,
    );
    elements.push(list);
    if (list.hiddenLines) warnings.push(`“${title}” does not fit. Shorten the list.`);
  };
  listBox(L.strengths, m.strengths, '✓', 1.85, 2.2, 'strengths');
  listBox(L.weaknesses, m.weaknesses, '▢', 4.2, 2.3, 'weaknesses');

  // Security status scale, with the current level ticked.
  const x = 8.5;
  const w = SLIDE_W - MARGIN - x;
  elements.push(
    { kind: 'rect', x, y: 1.85, w, h: 0.6, fill: style.primary, radius: 0.08 },
    textBox(
      [para(L.status, true)],
      {
        role: 'status-title',
        x,
        y: 1.85,
        w,
        h: 0.6,
        sizePt: ctx.pt(16),
        color: style.onPrimary,
        align: 'center',
        valign: 'middle',
        ...ctx.body,
      },
      ctx.measure,
    ),
    {
      kind: 'rect',
      x,
      y: 2.55,
      w,
      h: 3.95,
      fill: '#ffffff',
      stroke: style.primary,
      strokePt: 1,
      radius: 0.08,
    },
  );
  SECURITY_LEVELS.forEach((l: SecurityLevel, i) => {
    const y = 2.68 + i * 0.95;
    const colours = ctx.theme.severity[LEVEL_SEVERITY[l]];
    elements.push(
      { kind: 'rect', x: x + 0.15, y: y + 0.05, w: 0.12, h: 0.75, fill: colours.bg },
      textBox(
        [para(ctx.L.levels[l].name, true)],
        {
          role: 'level-name',
          x: x + 0.4,
          y,
          w: w - 1.1,
          h: ptToIn(ctx.pt(13)) * LINE_HEIGHT,
          sizePt: ctx.pt(13),
          color: style.primary,
          ...ctx.body,
        },
        ctx.measure,
      ),
      textBox(
        [para(ctx.L.levels[l].rule)],
        {
          role: 'level-rule',
          x: x + 0.4,
          y: y + 0.3,
          w: w - 1.1,
          h: ptToIn(ctx.pt(10)) * LINE_HEIGHT * 2,
          sizePt: ctx.pt(10),
          color: ctx.theme.colors.muted,
          ...ctx.body,
        },
        ctx.measure,
      ),
      {
        kind: 'rect',
        x: x + w - 0.55,
        y: y + 0.15,
        w: 0.32,
        h: 0.32,
        fill: '#ffffff',
        stroke: style.primary,
        strokePt: 1,
      },
    );
    if (l === level) {
      elements.push(
        textBox(
          [para('X', true)],
          {
            role: 'level-tick',
            x: x + w - 0.55,
            y: y + 0.15,
            w: 0.32,
            h: 0.32,
            sizePt: ctx.pt(14),
            color: style.primary,
            align: 'center',
            valign: 'middle',
            ...ctx.body,
          },
          ctx.measure,
        ),
      );
    }
  });
  elements.push(
    textBox(
      [para(L.footnote)],
      {
        role: 'footnote',
        x,
        y: 6.56,
        w,
        h: ptToIn(ctx.pt(8)) * LINE_HEIGHT * 2,
        sizePt: ctx.pt(8),
        color: ctx.theme.colors.muted,
        ...ctx.body,
      },
      ctx.measure,
    ),
  );
  return contentSlide(ctx, m, 'summary', `${L.title} – ${product}`, elements, warnings);
}

// --- Appendix ---------------------------------------------------------------------------

function statusScaleSlide(ctx: Ctx, m: MissionDetails): Slide {
  const A = ctx.L.appendix;
  const rows: Cell[][] = [
    titleRow(ctx, A.statusScale, 2),
    headRow(ctx, [A.status, A.description]),
    ...SECURITY_LEVELS.map((l): Cell[] => {
      const c = ctx.theme.severity[LEVEL_SEVERITY[l]];
      return [
        { text: ctx.L.levels[l].name, fill: c.bg, color: c.fg, bold: true, align: 'center' },
        { text: ctx.L.levels[l].rule, fill: '#ffffff' },
      ];
    }),
  ];
  const t = table(ctx, MARGIN, 2, [3, CONTENT_W - 3], rows, {
    minRowH: 0.5,
    grid: ctx.style.light,
  });
  return contentSlide(ctx, m, 'appendix', A.statusScale, t.elements);
}

function severityScaleSlide(ctx: Ctx, m: MissionDetails): Slide {
  const A = ctx.L.appendix;
  const N = A.severityNames;
  const sev = ctx.theme.severity;
  const cell = (s: keyof typeof sev, text: string): Cell => ({
    text,
    fill: sev[s].bg,
    color: sev[s].fg,
    align: 'center',
    bold: true,
  });
  const rows: Cell[][] = [
    titleRow(ctx, A.severityScale, 6),
    headRow(ctx, [A.baseScore, '0', '0.1 – 3.9', '4.0 – 6.9', '7.0 – 8.9', '9.0 – 10.0']),
    [
      { text: A.severity, bold: true, align: 'center', fill: '#ffffff' },
      cell('None', N.info),
      cell('Low', N.low),
      cell('Medium', N.medium),
      cell('High', N.high),
      cell('Critical', N.critical),
    ],
  ];
  const first = 2.4;
  const rest = (CONTENT_W - first) / 5;
  const t = table(ctx, MARGIN, 2, [first, rest, rest, rest, rest, rest], rows, { minRowH: 0.45 });
  return contentSlide(ctx, m, 'appendix', A.severityScale, t.elements);
}

/** CVSS 3.1 base metric values with their weights and a one-line description. */
const METRICS: {
  metric: { en: string; fr: string };
  values: {
    en: string;
    fr: string;
    letter: string;
    weight: string;
    desc: { en: string; fr: string };
  }[];
}[] = [
  {
    metric: { en: 'Attack Vector', fr: 'Vecteur d’attaque' },
    values: [
      {
        en: 'Network',
        fr: 'Réseau',
        letter: 'N',
        weight: '0.85',
        desc: {
          en: 'Exploitable remotely, up to the whole Internet.',
          fr: 'Exploitable à distance, jusqu’à tout Internet.',
        },
      },
      {
        en: 'Adjacent',
        fr: 'Adjacent',
        letter: 'A',
        weight: '0.62',
        desc: {
          en: 'Exploitable only from the same local network.',
          fr: 'Exploitable uniquement depuis le même réseau local.',
        },
      },
      {
        en: 'Local',
        fr: 'Local',
        letter: 'L',
        weight: '0.55',
        desc: {
          en: 'Needs local access to the vulnerable component.',
          fr: 'Nécessite un accès local au composant vulnérable.',
        },
      },
      {
        en: 'Physical',
        fr: 'Physique',
        letter: 'P',
        weight: '0.20',
        desc: {
          en: 'Needs to physically touch the vulnerable component.',
          fr: 'Nécessite d’intervenir physiquement sur le composant.',
        },
      },
    ],
  },
  {
    metric: { en: 'Attack Complexity', fr: 'Complexité d’attaque' },
    values: [
      {
        en: 'Low',
        fr: 'Faible',
        letter: 'L',
        weight: '0.77',
        desc: {
          en: 'No special conditions: repeatable success.',
          fr: 'Aucune condition particulière : succès reproductible.',
        },
      },
      {
        en: 'High',
        fr: 'Élevée',
        letter: 'H',
        weight: '0.44',
        desc: {
          en: 'Needs preparation or conditions outside the attacker’s control.',
          fr: 'Nécessite une préparation ou des conditions hors du contrôle de l’attaquant.',
        },
      },
    ],
  },
  {
    metric: { en: 'Privileges Required', fr: 'Privilèges requis' },
    values: [
      {
        en: 'None',
        fr: 'Aucun',
        letter: 'N',
        weight: '0.85',
        desc: { en: 'Unauthenticated attacker.', fr: 'Attaquant non authentifié.' },
      },
      {
        en: 'Low',
        fr: 'Faibles',
        letter: 'L',
        weight: '0.62 (0.68)',
        desc: { en: 'Basic user privileges.', fr: 'Privilèges d’utilisateur standard.' },
      },
      {
        en: 'High',
        fr: 'Élevés',
        letter: 'H',
        weight: '0.27 (0.50)',
        desc: { en: 'Administrative privileges.', fr: 'Privilèges d’administration.' },
      },
    ],
  },
  {
    metric: { en: 'User Interaction', fr: 'Interaction utilisateur' },
    values: [
      {
        en: 'None',
        fr: 'Aucune',
        letter: 'N',
        weight: '0.85',
        desc: { en: 'No action from another user.', fr: 'Aucune action d’un autre utilisateur.' },
      },
      {
        en: 'Required',
        fr: 'Requise',
        letter: 'R',
        weight: '0.62',
        desc: { en: 'Another user must take an action.', fr: 'Un autre utilisateur doit agir.' },
      },
    ],
  },
  {
    metric: { en: 'Impact (C, I, A)', fr: 'Impact (C, I, D)' },
    values: [
      {
        en: 'None',
        fr: 'Aucun',
        letter: 'N',
        weight: '0',
        desc: { en: 'No impact.', fr: 'Aucun impact.' },
      },
      {
        en: 'Low',
        fr: 'Faible',
        letter: 'L',
        weight: '0.22',
        desc: {
          en: 'Limited loss; the attacker does not control what is affected.',
          fr: 'Perte limitée ; l’attaquant ne choisit pas ce qui est touché.',
        },
      },
      {
        en: 'High',
        fr: 'Élevé',
        letter: 'H',
        weight: '0.56',
        desc: {
          en: 'Total loss, or a limited loss with a serious direct impact.',
          fr: 'Perte totale, ou perte limitée à l’impact direct grave.',
        },
      },
    ],
  },
  {
    metric: { en: 'Scope', fr: 'Portée' },
    values: [
      {
        en: 'Unchanged',
        fr: 'Inchangée',
        letter: 'U',
        weight: '—',
        desc: {
          en: 'Impact stays within the vulnerable component’s authority.',
          fr: 'L’impact reste dans le périmètre du composant vulnérable.',
        },
      },
      {
        en: 'Changed',
        fr: 'Changée',
        letter: 'C',
        weight: '—',
        desc: {
          en: 'Impact reaches components beyond its authority.',
          fr: 'L’impact touche des composants hors de son périmètre.',
        },
      },
    ],
  },
];

function metricsSlide(ctx: Ctx, m: MissionDetails): Slide {
  const A = ctx.L.appendix;
  const lang = ctx.theme.language;
  const rows: Cell[][] = [
    titleRow(ctx, A.metrics, 5),
    headRow(ctx, ['', A.value, A.letter, A.score, A.description]),
  ];
  for (const group of METRICS) {
    group.values.forEach((v, i) => {
      const row: Cell[] = [];
      if (i === 0) {
        row.push({
          text: group.metric[lang],
          rowSpan: group.values.length,
          fill: ctx.style.primary,
          color: ctx.style.onPrimary,
          bold: true,
          align: 'center',
        });
      }
      row.push(
        { text: v[lang], align: 'center', fill: '#ffffff' },
        { text: v.letter, align: 'center', fill: '#ffffff' },
        { text: v.weight, align: 'center', fill: '#ffffff' },
        { text: v.desc[lang], fill: '#ffffff' },
      );
      rows.push(row);
    });
  }
  const t = table(ctx, MARGIN, CONTENT_TOP, [2.3, 1.4, 0.9, 1.3, CONTENT_W - 5.9], rows, {
    sizePt: 10,
    minRowH: 0.27,
    grid: ctx.style.light,
  });
  return contentSlide(
    ctx,
    m,
    'appendix',
    A.metrics,
    t.elements,
    t.overflow ? ['The CVSS metrics table does not fit: lower the theme’s minimum font size.'] : [],
  );
}

function scenarioScaleSlide(ctx: Ctx, m: MissionDetails): Slide {
  const A = ctx.L.appendix;
  const S = LABELS[ctx.theme.language].scenario;
  const rows: Cell[][] = [
    titleRow(ctx, A.scenarioScaleTable, 3),
    headRow(ctx, ['#', A.exploitability, A.impact]),
    ...RATINGS.map((r): Cell[] => [
      { text: String(r), align: 'center', fill: '#ffffff', bold: true },
      { text: S.levels.exploitability[r], align: 'center', fill: '#ffffff' },
      { text: S.levels.impact[r], align: 'center', fill: '#ffffff' },
    ]),
  ];
  const t = table(ctx, MARGIN + 1.5, CONTENT_TOP + 0.3, [0.8, 4.2, 4.3], rows, {
    minRowH: 0.42,
    grid: ctx.style.light,
  });
  const rules = textBox(
    [
      { runs: [{ text: `${A.exploitability}: `, bold: true }, { text: A.exploitabilityRule }] },
      { runs: [{ text: '' }] },
      { runs: [{ text: `${A.impact}: `, bold: true }, { text: A.impactRule }] },
    ],
    {
      role: 'scale-rules',
      x: MARGIN + 1.5,
      y: t.bottom + 0.35,
      w: 9.3,
      h: CONTENT_BOTTOM - t.bottom - 0.35,
      sizePt: ctx.pt(12),
      color: ctx.theme.colors.text,
      ...ctx.body,
    },
    ctx.measure,
  );
  return contentSlide(ctx, m, 'appendix', A.scenarioScale, [...t.elements, rules]);
}

function scenarioSeveritySlide(ctx: Ctx, m: MissionDetails): Slide {
  const A = ctx.L.appendix;
  const S = LABELS[ctx.theme.language].scenario;
  const label = {
    fill: ctx.style.primary,
    color: ctx.style.onPrimary,
    bold: true,
    align: 'center' as const,
  };
  const rows: Cell[][] = [titleRow(ctx, A.scenarioSeverityTable, 7)];
  [...RATINGS].reverse().forEach((e, i) => {
    const row: Cell[] = [];
    if (i === 0) row.push({ ...label, text: A.exploitability, rowSpan: 5 });
    row.push({ text: S.levels.exploitability[e], align: 'center', fill: '#ffffff' });
    for (const imp of RATINGS) {
      const sev = scenarioSeverity(e, imp);
      const c = ctx.theme.severity[SEVERITY_COLOURS[sev]];
      row.push({ text: S.levels.severity[sev], fill: c.bg, color: c.fg, align: 'center' });
    }
    rows.push(row);
  });
  rows.push([
    { text: '', colSpan: 2, fill: '#ffffff' },
    ...RATINGS.map((r): Cell => ({ text: S.levels.impact[r], align: 'center', fill: '#ffffff' })),
  ]);
  rows.push([
    { text: '', colSpan: 2, fill: '#ffffff' },
    { ...label, text: A.impact, colSpan: 5 },
  ]);
  const cw = (CONTENT_W - 3.3) / 5;
  const t = table(ctx, MARGIN, CONTENT_TOP + 0.2, [1.5, 1.8, cw, cw, cw, cw, cw], rows, {
    minRowH: 0.55,
    grid: ctx.style.light,
  });
  return contentSlide(ctx, m, 'appendix', A.scenarioSeverity, t.elements);
}

function recoScalesSlide(ctx: Ctx, m: MissionDetails): Slide {
  const A = ctx.L.appendix;
  const crit = ctx.L.criteria;
  const first: Cell[][] = [
    titleRow(ctx, A.recoScales, 4),
    headRow(ctx, [A.criterion, A.lowest, '2', A.highest]),
    ...CRITERIA.map((k): Cell[] => [
      { text: crit[k].name, bold: true, align: 'center', fill: '#ffffff' },
      ...SCALE3.map((v): Cell => ({ text: crit[k].levels[v], align: 'center', fill: '#ffffff' })),
    ]),
  ];
  const w = (CONTENT_W - 2.3) / 3;
  const t1 = table(ctx, MARGIN, CONTENT_TOP, [2.3, w, w, w], first, { grid: ctx.style.light });
  const second: Cell[][] = [
    titleRow(ctx, A.recoClassification, 2),
    headRow(ctx, [A.classification, A.description]),
    ...QUADRANTS.map((q): Cell[] => [
      { text: ctx.L.quadrants[q], bold: true, align: 'center', fill: '#ffffff' },
      { text: A.rules[q], fill: '#ffffff' },
    ]),
  ];
  const t2 = table(ctx, MARGIN, t1.bottom + 0.4, [2.3, CONTENT_W - 2.3], second, {
    grid: ctx.style.light,
  });
  return contentSlide(
    ctx,
    m,
    'appendix',
    A.recoScales,
    [...t1.elements, ...t2.elements],
    t2.overflow ? ['The recommendation scales do not fit on one slide.'] : [],
  );
}

function scenarioSlides(
  ctx: Ctx,
  m: MissionDetails,
  scenarios: Scenario[],
  findings: Map<string, Finding>,
): Slide[] {
  if (!scenarios.length) return [];
  const bodies = [
    ...scenarioSummary(ctx, scenarios),
    ...[...scenarios]
      .sort((a, b) => a.number - b.number)
      .map((s) => scenarioDetail(ctx, s, findings)),
  ];
  return bodies.map((b) => contentSlide(ctx, m, 'scenarios', b.title, b.elements, b.warnings));
}

/** Builds the deck. Sections without slides are left out of the agenda. */
export function buildReportDeck(
  input: ReportInput,
  theme: SlideTheme,
  measure: Measure,
): ReportDeck {
  const ctx = makeCtx(theme, measure);
  const m = { ...EMPTY_MISSION, ...input.project.mission };
  const findings = new Map((input.findings ?? []).map((f) => [f.id, f]));
  const recs = input.recommendations ?? [];
  const content: Record<Section, Slide[]> = {
    introduction: [modalitiesSlide(ctx, m)],
    summary: [summarySlide(ctx, m, input.scenarios)],
    scenarios: scenarioSlides(ctx, m, input.scenarios, findings),
    vulnerabilities: reportFindings(input.findings ?? []).flatMap((f) =>
      vulnerabilitySlides(
        ctx,
        f,
        input.evidence?.get(f.id) ?? [],
        recs.filter((r) => r.findingIds.includes(f.id)),
        input.project,
      ).map((b) => contentSlide(ctx, m, 'vulnerabilities', b.title, b.elements, b.warnings)),
    ),
    recommendations: recs.length
      ? actionPlan(ctx, recs, m).map((b) =>
          contentSlide(ctx, m, 'recommendations', b.title, b.elements, b.warnings),
        )
      : [],
    appendix: [
      statusScaleSlide(ctx, m),
      severityScaleSlide(ctx, m),
      metricsSlide(ctx, m),
      scenarioScaleSlide(ctx, m),
      scenarioSeveritySlide(ctx, m),
      recoScalesSlide(ctx, m),
    ],
  };
  const used = SECTIONS.filter((s) => content[s].length > 0);
  // Page numbers: cover, then for each section an agenda slide and its content.
  const sections: ReportDeck['sections'] = [];
  let page = 1;
  for (const s of used) {
    page += 1; // the agenda before the section
    sections.push({ section: s, page: page + 1 });
    page += content[s].length;
  }
  const slides: Slide[] = [coverSlide(ctx, m)];
  for (const s of used) {
    slides.push(agendaSlide(ctx, sections, s), ...content[s]);
  }
  slides.push(closingSlide(ctx));
  // Footers on every slide but the cover and the closing slide.
  slides.forEach((slide, i) => {
    if (i > 0 && i < slides.length - 1) slide.elements.push(...footer(ctx, i + 1));
  });
  return { slides, sections };
}
