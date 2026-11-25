import { useEffect, useMemo, useState } from 'preact/hooks';
import { downloadBlob, langTag, PPTX_TYPE, safeFileName } from '../export/collect';
import { buildPptx } from '../export/pptx';
import type { Project } from '../findings/model';
import type { Scenario } from '../scenarios/model';
import { canvasMeasure } from '../slides/measure';
import { SlideSvg } from '../slides/SlideSvg';
import type { SlideTheme } from '../slides/theme';
import { loadTheme } from '../slides/themeStore';
import type { Vault } from '../storage/vault';
import { on } from '../ui/events';
import { buildReportDeck } from './deck';

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
  useEffect(() => {
    const load = () => void loadTheme(vault).then(setTheme);
    load();
    return on('theme-changed', load);
  }, [vault]);

  const deck = useMemo(
    () => (theme ? buildReportDeck({ project, scenarios }, theme, canvasMeasure) : null),
    [theme, project, scenarios],
  );
  const images = useMemo(() => (theme ? themeImages(theme) : {}), [theme]);
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

  if (!theme || !deck) return <p aria-busy="true">Loading…</p>;
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
