import { useEffect, useMemo, useState } from 'preact/hooks';
import { downloadBlob, langTag, PPTX_TYPE, safeFileName } from '../export/collect';
import { buildPptx } from '../export/pptx';
import { getEvidenceBytes, listEvidence } from '../evidence/repository';
import type { Finding, Project } from '../findings/model';
import { whenSaved } from '../findings/pendingSaves';
import { listFindings } from '../findings/repository';
import type { Recommendation } from '../recommendations/model';
import { listRecommendations } from '../recommendations/repository';
import type { EvidenceRef } from '../slides/layout';
import type { Scenario } from '../scenarios/model';
import { canvasMeasure } from '../slides/measure';
import { SlideSvg } from '../slides/SlideSvg';
import type { SlideTheme } from '../slides/theme';
import { loadTheme } from '../slides/themeStore';
import type { Vault } from '../storage/vault';
import { on } from '../ui/events';
import { buildReportDeck } from './deck';
import { reportFindings } from './sections';

interface Data {
  findings: Finding[];
  recommendations: Recommendation[];
  evidence: Map<string, EvidenceRef[]>;
  /** PNG bytes of the evidence shown (4 per reported finding at most). */
  bytes: Record<string, Uint8Array<ArrayBuffer>>;
}

async function loadData(vault: Vault, projectId: string): Promise<Data> {
  await whenSaved();
  const findings = await listFindings(vault, projectId);
  const evidence = new Map<string, EvidenceRef[]>();
  const bytes: Data['bytes'] = {};
  for (const f of reportFindings(findings)) {
    const list = await listEvidence(vault, f.id);
    evidence.set(f.id, list);
    for (const e of list.slice(0, 4)) {
      const b = await getEvidenceBytes(vault, e.id);
      if (b) bytes[e.id] = b;
    }
  }
  return {
    findings,
    recommendations: await listRecommendations(vault, projectId),
    evidence,
    bytes,
  };
}

/** PNG bytes of the theme images a report slide can show, by image source. */
function themeImages(theme: SlideTheme): Record<string, Uint8Array<ArrayBuffer>> {
  const out: Record<string, Uint8Array<ArrayBuffer>> = {};
  if (theme.logo) out.logo = theme.logo.bytes;
  if (theme.report?.cover) out.cover = theme.report.cover.bytes;
  if (theme.report?.coverLogo) out.coverLogo = theme.report.coverLogo.bytes;
  return out;
}

/** Preview and PowerPoint export of the full report deck (reportDeck flag). */
export function ReportExport(props: { vault: Vault; project: Project; scenarios: Scenario[] }) {
  const { vault, project, scenarios } = props;
  const [theme, setTheme] = useState<SlideTheme | null>(null);
  const [status, setStatus] = useState('');
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    const load = () => void loadTheme(vault).then(setTheme);
    load();
    return on('theme-changed', load);
  }, [vault]);
  useEffect(() => {
    void loadData(vault, project.id).then(setData);
    return on('evidence-changed', () => void loadData(vault, project.id).then(setData));
  }, [vault, project.id]);

  const deck = useMemo(
    () =>
      theme && data
        ? buildReportDeck(
            {
              project,
              scenarios,
              findings: data.findings,
              recommendations: data.recommendations,
              evidence: data.evidence,
            },
            theme,
            canvasMeasure,
          )
        : null,
    [theme, project, scenarios, data],
  );
  const images = useMemo(
    () => (theme && data ? { ...data.bytes, ...themeImages(theme) } : {}),
    [theme, data],
  );
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const made = Object.fromEntries(
      Object.entries(images).map(([k, bytes]) => [
        k,
        URL.createObjectURL(new Blob([bytes], { type: 'image/png' })),
      ]),
    );
    setUrls(made);
    return () => Object.values(made).forEach((u) => URL.revokeObjectURL(u));
  }, [images]);

  if (!theme || !deck || !data) return <p aria-busy="true">Loading…</p>;
  const drafts = data.findings.filter((f) => f.status !== 'validated').length;
  const flagged = deck.slides.flatMap((s, i) => s.warnings.map((w) => `Slide ${i + 1}: ${w}`));

  const exportPptx = () => {
    const bytes = buildPptx(deck.slides, images, {
      title: `${project.mission?.client ?? ''} ${project.mission?.product ?? project.name}`.trim(),
      lang: langTag(theme),
      headingFont: theme.headingFont,
      bodyFont: theme.bodyFont,
      created: new Date(),
    });
    downloadBlob(
      new Blob([bytes], { type: PPTX_TYPE }),
      `${safeFileName(project.name, 'report')}-report.pptx`,
    );
    setStatus(`Report downloaded: ${deck.slides.length} slides.`);
  };

  return (
    <section class="field" aria-labelledby="report-deck-title">
      <h3 id="report-deck-title">Report deck</h3>
      <p class="hint">
        Save it as PDF from PowerPoint if you need one. The look comes from Settings → Slide theme →
        Report deck.
      </p>
      <p class="row">
        <button type="button" class="primary" onClick={exportPptx}>
          Export report (.pptx)
        </button>
        <span role="status" class="muted">
          {status}
        </span>
      </p>
      {drafts > 0 && (
        <p class="hint" data-testid="report-drafts">
          {drafts} draft finding{drafts > 1 ? 's are' : ' is'} not in the report: only validated
          findings are.
        </p>
      )}
      {flagged.length > 0 && (
        <ul class="warning" data-testid="report-warnings">
          {flagged.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <ol class="report-thumbs" aria-label="Report slides">
        {deck.slides.map((s, i) => (
          <li key={i}>
            <SlideSvg
              slide={s}
              images={urls}
              label={`Report slide ${i + 1} of ${deck.slides.length}`}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
