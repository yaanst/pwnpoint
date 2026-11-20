import { useEffect, useMemo, useState } from 'preact/hooks';
import { type Evidence, listEvidence } from '../evidence/repository';
import { FindingExport } from '../export/FindingExport';
import type { Finding } from '../findings/model';
import type { Vault } from '../storage/vault';
import { on } from '../ui/events';
import { buildFindingSlide } from './layout';
import { canvasMeasure } from './measure';
import { SlideSvg } from './SlideSvg';
import type { SlideTheme } from './theme';
import { loadTheme } from './themeStore';
import { useSlideImages } from './useSlideImages';

/** Live 16:9 preview of a finding's slide, with overflow warnings. */
export function SlidePreview({ vault, finding }: { vault: Vault; finding: Finding }) {
  const [theme, setTheme] = useState<SlideTheme | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);

  useEffect(() => {
    const loadEvidence = () => void listEvidence(vault, finding.id).then(setEvidence);
    const reloadTheme = () => void loadTheme(vault).then(setTheme);
    loadEvidence();
    reloadTheme();
    const offE = on('evidence-changed', loadEvidence);
    const offT = on('theme-changed', reloadTheme);
    return () => {
      offE();
      offT();
    };
  }, [vault, finding.id]);

  const urls = useSlideImages(vault, evidence.slice(0, 2), theme);
  const slide = useMemo(
    () => (theme ? buildFindingSlide(finding, evidence, theme, canvasMeasure) : null),
    [finding, evidence, theme],
  );

  return (
    <section class="slide-preview" aria-labelledby="slide-preview-title">
      <h3 id="slide-preview-title">Slide preview</h3>
      {slide && theme ? (
        <>
          <div class="slide-frame">
            <SlideSvg
              slide={slide}
              images={urls}
              label={`Slide preview of ${finding.title || 'this finding'}`}
            />
          </div>
          {slide.warnings.length > 0 ? (
            <div role="status" data-testid="slide-warnings">
              <ul class="errors slide-warnings">
                {slide.warnings.map((w) => (
                  <li key={w}>⚠️ {w}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p class="muted small-text" role="status" data-testid="slide-warnings">
              Everything fits on the slide.
            </p>
          )}
          <FindingExport vault={vault} finding={finding} theme={theme} />
        </>
      ) : (
        <p aria-busy="true">Loading…</p>
      )}
    </section>
  );
}
