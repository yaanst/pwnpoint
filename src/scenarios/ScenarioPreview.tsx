import { useEffect, useMemo, useState } from 'preact/hooks';
import { canvasToPng, decodeImages, renderSlideToCanvas } from '../export/canvas';
import {
  copyPng,
  copyText,
  downloadBlob,
  langTag,
  PPTX_TYPE,
  safeFileName,
  scenarioBundle,
} from '../export/collect';
import { scenarioMarkdown } from '../export/markdown';
import { buildPptx } from '../export/pptx';
import type { Finding } from '../findings/model';
import { canvasMeasure } from '../slides/measure';
import { SlideSvg } from '../slides/SlideSvg';
import type { SlideTheme } from '../slides/theme';
import { loadTheme } from '../slides/themeStore';
import { useSlideImages } from '../slides/useSlideImages';
import type { Vault } from '../storage/vault';
import { on } from '../ui/events';
import { MAX_SCENARIO_SLIDES } from './layout';
import { type Scenario, scenarioRef } from './model';

type Action = 'pptx' | 'png' | 'copy-png' | 'markdown';

/** Live preview of the scenario slide(s), warnings and exports. */
export function ScenarioPreview({
  vault,
  scenario,
  findings,
}: {
  vault: Vault;
  scenario: Scenario;
  findings: Finding[];
}) {
  const [theme, setTheme] = useState<SlideTheme | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [status, setStatus] = useState('');
  useEffect(() => {
    const reload = () => void loadTheme(vault).then(setTheme);
    reload();
    return on('theme-changed', reload);
  }, [vault]);
  const urls = useSlideImages(vault, [], theme);
  const bundle = useMemo(
    () => (theme ? scenarioBundle(scenario, findings, theme, canvasMeasure) : null),
    [scenario, findings, theme],
  );
  if (!theme || !bundle) return <p aria-busy="true">Loading…</p>;

  const { layout } = bundle;
  const warnings = [...new Set(layout.slides.flatMap((s) => s.warnings))];
  const ref = scenarioRef(scenario.number);
  const base = safeFileName(`${ref}-${scenario.title}`, ref);
  const two = layout.slides.length > 1;

  const run = async (action: Action) => {
    setBusy(action);
    setStatus('');
    try {
      if (action === 'markdown') {
        await copyText(
          scenarioMarkdown(scenario, new Map(findings.map((f) => [f.id, f])), theme.language),
        );
        setStatus('Markdown copied to the clipboard.');
      } else if (action === 'pptx') {
        const bytes = buildPptx(bundle.slides, bundle.images, {
          title: `${ref} ${scenario.title}`.trim(),
          lang: langTag(theme),
          headingFont: theme.headingFont,
          bodyFont: theme.bodyFont,
          created: new Date(),
        });
        downloadBlob(new Blob([bytes], { type: PPTX_TYPE }), `${base}.pptx`);
        setStatus('PowerPoint file downloaded.');
      } else {
        const images = await decodeImages(bundle.images);
        const pngs = await Promise.all(
          bundle.slides.map((s) => canvasToPng(renderSlideToCanvas(s, images))),
        );
        if (action === 'copy-png') {
          const [png] = pngs;
          if (png) await copyPng(png);
          setStatus('Slide image copied to the clipboard.');
        } else {
          pngs.forEach((png, i) => downloadBlob(png, two ? `${base}-${i + 1}.png` : `${base}.png`));
          setStatus(two ? '2 PNG files downloaded (one per slide).' : 'PNG downloaded.');
        }
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setBusy(null);
    }
  };
  const button = (action: Action, label: string, disabled = false) => (
    <button
      type="button"
      class="small"
      disabled={busy !== null || disabled}
      aria-busy={busy === action}
      onClick={() => void run(action)}
    >
      {label}
    </button>
  );

  return (
    <section class="slide-preview" aria-labelledby="scenario-preview-title">
      <h3 id="scenario-preview-title">
        Slide preview{two ? ` (${layout.slides.length} slides)` : ''}
      </h3>
      {layout.slides.map((slide, i) => (
        <div class="slide-frame" key={i}>
          <SlideSvg
            slide={slide}
            images={urls}
            label={`Scenario slide ${i + 1} of ${layout.slides.length}: ${scenario.title || 'untitled'}`}
          />
        </div>
      ))}
      <p class="muted small-text" data-testid="scenario-fit">
        {layout.blocked
          ? `Does not fit on ${MAX_SCENARIO_SLIDES} slides.`
          : `${layout.slides.length === 1 ? 'Fits on one slide' : `Split over 2 slides after step ${layout.splitAt ?? 0}`}, step text at ${layout.fontPt} pt.`}
      </p>
      {warnings.length > 0 ? (
        <div role="status" data-testid="slide-warnings">
          <ul class="errors slide-warnings">
            {warnings.map((w) => (
              <li key={w}>⚠️ {w}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p class="muted small-text" role="status" data-testid="slide-warnings">
          Everything fits.
        </p>
      )}
      <div class="export-bar" role="group" aria-label="Export this scenario">
        <div class="row">
          {button('pptx', 'Download .pptx', layout.blocked)}
          {button('png', two ? 'Download PNGs' : 'Download PNG', layout.blocked)}
          {button('copy-png', 'Copy PNG', layout.blocked || two)}
          {button('markdown', 'Copy Markdown')}
        </div>
        <p class="muted small-text" role="status" data-testid="export-status">
          {status ||
            (layout.blocked
              ? 'Slide exports are blocked until the flow fits on 2 slides.'
              : two
                ? 'Copy PNG works with one slide: download the PNGs instead.'
                : '')}
        </p>
      </div>
    </section>
  );
}
